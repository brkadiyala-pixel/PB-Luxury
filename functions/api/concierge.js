/**
 * POST /api/concierge
 *
 * Powers the "Luxury home concierge" chat widget. Forwards the
 * conversation to Claude (Anthropic API) with a system prompt describing
 * this brokerage, and returns the reply as JSON: { reply: "..." }.
 *
 * Required Cloudflare Pages environment variable / secret:
 *   ANTHROPIC_API_KEY — your Anthropic API key (console.anthropic.com)
 *
 * Set it in: Cloudflare dashboard > Workers & Pages > your project
 * > Settings > Environment variables > add ANTHROPIC_API_KEY as a Secret.
 *
 * NOTE ON DATA: this function does not currently query a live IDX feed,
 * so the model is instructed not to invent specific addresses or prices.
 * Once IDX is connected, pass matching listings in as additional context
 * (see the commented section below) so the concierge can reference real
 * inventory instead of speaking generally.
 */
const SYSTEM_PROMPT = `You are the Luxury Home Concierge for "Luxury Redefined Palm Beach," a website operated by licensed agents of Dalton Wade, Inc. (Broker: Bharath Kadiyala, License #BK3462426, 1st Ave S Ste 200, St. Petersburg, FL 33701).

Facts you can rely on:
- Service area: Palm Beach County — Palm Beach, Jupiter, Boca Raton, Manalapan, Delray Beach.
- Property types: waterfront estates, golf community homes, new construction, luxury condos.
- Buyer agency fee: 1.45% of purchase price, per the written buyer representation agreement.
- Estimated listing commission (for sellers): approximately 2.5% of sale price — this varies by property and is set in a separate written listing agreement, not fixed.
- Buyer rebate: up to 1.5% of the purchase price credited back at closing. This is an estimate, subject to the purchase contract, seller cooperation, and lender approval.
- For any specific rebate number, always direct the person to the on-site rebate calculator rather than computing or quoting an exact dollar figure yourself — say something like "our rebate calculator can give you an exact estimate, or I can have a specialist confirm the numbers with you directly." Do not do the rebate math yourself in chat; the calculator handles it with the required Florida disclosures attached.
- Private clubs we work in most: The Bears Club and Admirals Cove (Jupiter), Old Palm Golf Club (Palm Beach Gardens), Frenchman's Creek (Palm Beach Gardens). Club membership is a separate application from the real estate purchase and is not guaranteed by the brokerage — always mention this if a club is discussed.
- New developments / pre-construction: we track upcoming projects across the county before general public release; specific current projects should come from the New Developments page, not be invented.
- Off-market / private access: buyers can share their criteria to receive pocket listings and first-look opportunities before they hit the open market. Sellers can also start a discreet, pre-MLS marketing process.
- The site has dedicated community pages (Palm Beach, Jupiter, Boca Raton, Manalapan), a private clubs page, a new developments page, an about/team page, and market insight articles — you can refer people to these by name so they can read more.
- This is a real estate brokerage, not a lender or attorney — do not give legal, tax, or loan advice; suggest the person consult the appropriate licensed professional for those questions.

How to behave:
- Be warm, concise, and specific. Sentence case, no exclamation points, no corporate filler.
- Never invent a specific property address, price, exact listing, or specific pre-construction project name you have not been given — speak in ranges and generalities about the market instead, and offer to connect them with a specialist for exact inventory.
- If someone wants to book a consultation, get a valuation, request off-market access, or asks something you can't fully answer, ask for their name and best phone number so a specialist can follow up — do not just say goodbye.
- Keep replies to 2-4 sentences unless the person asks for more detail.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'Concierge is not configured yet (missing ANTHROPIC_API_KEY).' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const message = String(body.message || '').slice(0, 2000);
  if (!message) return json({ error: 'Message is required' }, 400);

  // Trim and sanitize incoming history to just role/content pairs.
  const history = Array.isArray(body.history)
    ? body.history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];

  const messages = [...history, { role: 'user', content: message }];

  /* IDX HOOK-UP POINT:
     Once your MLS feed is live, look up matching listings here based on
     the user's message (price, community, property type) and append a
     short JSON summary as an extra system-role note, e.g.:

     const matches = await fetchIDXListings({ ... });
     messages.unshift({ role: 'user', content: `Current matching listings: ${JSON.stringify(matches)}` });
  */

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: 'AI request failed', detail }, 502);
    }

    const data = await res.json();
    const reply = (data.content || [])
      .map(block => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim() || "I'll connect you with a specialist who can help with that.";

    return json({ reply });
  } catch (err) {
    return json({ error: 'Unexpected error contacting the AI service', detail: String(err) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
