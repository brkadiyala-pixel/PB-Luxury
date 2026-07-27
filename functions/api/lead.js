/**
 * POST /api/lead
 *
 * Receives a lead from the website (buyer or seller form) and emails it
 * to the brokerage inbox via Resend (https://resend.com).
 *
 * Required Cloudflare Pages environment variables / secrets:
 *   RESEND_API_KEY  — your Resend API key
 *   LEAD_EMAIL      — where leads should be delivered (defaults to
 *                     brkadiyala@gmail.com if not set)
 *   FROM_EMAIL      — a "from" address on a domain you've verified in
 *                     Resend, e.g. leads@luxuryredefinedpb.com
 *
 * Set these in: Cloudflare dashboard > Workers & Pages > your project
 * > Settings > Environment variables (mark RESEND_API_KEY as "Secret").
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  let lead;
  try {
    lead = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (!lead.name || !lead.email) {
    return json({ error: 'Name and email are required' }, 400);
  }

  // Very light validation / sanitization
  const name = String(lead.name).slice(0, 200);
  const email = String(lead.email).slice(0, 200);
  const phone = String(lead.phone || 'Not provided').slice(0, 60);
  const source = String(lead.source || 'buyer').slice(0, 60);
  const site = String(lead.site || 'luxuryredefinedpb.com').slice(0, 200);

  const toAddress = env.LEAD_EMAIL || 'brkadiyala@gmail.com';
  const fromAddress = env.FROM_EMAIL || 'Luxury Redefined <leads@luxuryredefinedpb.com>';

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
      body: JSON.stringify({
        from: fromAddress,
        to: [toAddress],
        reply_to: email,
        subject,
        text
      })
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
