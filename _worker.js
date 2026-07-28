/**
 * _worker.js
 *
 * This is the entry point for the Cloudflare Worker deployment of this site
 * (created via `wrangler deploy`, as opposed to a Cloudflare Pages deployment).
 *
 * Why this file exists: a plain Worker with static assets does NOT
 * automatically turn a /functions/api/*.js folder into live routes —
 * that convention only exists on Cloudflare Pages. Since this project was
 * deployed as a Worker, this file manually does that job: it handles
 * /api/lead and /api/concierge directly, and passes every other request
 * through to the static site files (env.ASSETS).
 */

const SYSTEM_PROMPT = `You are the Luxury Home Concierge for "Luxury Redefined Palm Beach," a website operated by licensed agents of Dalton Wade, Inc. (Broker: Bharath Kadiyala, License #BK3462426, Florida Firm License #CQ1047837, 1st Ave S Ste 200, St. Petersburg, FL 33701).

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleLead(request, env) {
  let lead;
  try {
    lead = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (!lead.name || !lead.email) {
    return json({ error: 'Name and email are required' }, 400);
  }

  const name = String(lead.name).slice(0, 200);
  const email = String(lead.email).slice(0, 200);
  const phone = String(lead.phone || 'Not provided').slice(0, 60);
  const source = String(lead.source || 'buyer').slice(0, 60);
  const site = String(lead.site || 'luxuryredefined.homes').slice(0, 200);

  const toAddress = env.LEAD_EMAIL || 'brkadiyala@gmail.com';
  const fromAddress = env.FROM_EMAIL || 'Luxury Redefined <leads@luxuryredefined.homes>';

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Email service is not configured yet (missing RESEND_API_KEY).' }, 500);
  }

  const sourceLabels = {
    seller: 'Seller — Request a valuation',
    buyer: 'Buyer — Concierge / consultation',
    'off-market': 'Buyer — Off-market / private access request',
    club: 'Buyer — Private club community inquiry',
    'new-development': 'Buyer — New development / pre-construction inquiry',
    'rebate-calculator': 'Buyer — Requested exact rebate number from calculator'
  };

  const subject = `New ${source} lead — ${name}`;
  const text = [
    `New lead from ${site}`,
    ``,
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone}`,
    `Source:  ${sourceLabels[source] || source}`,
    ``,
    `Reply directly to this email to reach the lead at ${email}.`
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: fromAddress, to: [toAddress], reply_to: email, subject, text })
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: 'Email provider rejected the request', detail }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: 'Unexpected error sending email', detail: String(err) }, 500);
  }
}

async function handleConcierge(request, env) {
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

  const history = Array.isArray(body.history)
    ? body.history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];

  const messages = [...history, { role: 'user', content: message }];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, system: SYSTEM_PROMPT, messages })
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/lead') {
      return handleLead(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/concierge') {
      return handleConcierge(request, env);
    }

    // Everything else: serve the static site files as before.
    return env.ASSETS.fetch(request);
  }
};
