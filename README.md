# Luxury Redefined Palm Beach — deployment guide

This folder is a ready-to-deploy Cloudflare Pages project:

```
luxury-redefined-palmbeach/
├── index.html                   homepage
├── about.html                   broker bio + testimonials (placeholders — see below)
├── clubs.html                   private golf & country club overview
├── new-developments.html        pre-construction (sample listings — see below)
├── DaltonWade_Logo.png
├── communities/
│   ├── palm-beach.html
│   ├── jupiter.html
│   ├── boca-raton.html
│   └── manalapan.html
├── insights/
│   ├── market-report.html
│   ├── community-guide.html
│   └── design-trends.html
└── functions/
    └── api/
        ├── lead.js              emails form submissions to brkadiyala@gmail.com
        └── concierge.js         powers the AI concierge chat via Claude
```

Cloudflare Pages serves `index.html` as-is and automatically turns anything
in `functions/api/*.js` into a live API route at `/api/*` — no separate
backend hosting needed.

## 1. Deploy the site

**Easiest path (no command line):**
1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Drag this whole folder in and give the project a name (e.g. `luxury-redefined-palmbeach`).
3. Cloudflare deploys it and gives you a URL like `luxury-redefined-palmbeach.pages.dev`.
4. Later, connect your own domain under the project's **Custom domains** tab.

**Command-line path (if you prefer Wrangler):**
```bash
npm install -g wrangler
cd luxury-redefined-palmbeach
wrangler pages deploy . --project-name=luxury-redefined-palmbeach
```

## 2. Turn on lead emails

The lead form (buyer inquiries and seller valuation requests) posts to
`/api/lead`, which sends the email through [Resend](https://resend.com) —
a straightforward transactional email API with a free tier.

1. Create a free Resend account and verify a sending domain (or use their
   shared test domain to start).
2. Generate an API key in Resend.
3. In Cloudflare: your Pages project → **Settings** → **Environment variables** → add:
   - `RESEND_API_KEY` — your Resend key (mark it **Secret**)
   - `LEAD_EMAIL` — `brkadiyala@gmail.com` (this is already the default in the code, so this variable is optional)
   - `FROM_EMAIL` — an address on your verified domain, e.g. `leads@luxuryredefinedpb.com`
4. Redeploy (or trigger a new deployment) so the environment variables take effect.

Every submission — buyer or seller — will land in **brkadiyala@gmail.com**
with the name, email, phone, and which form they used, and you can reply
directly to the lead's email from that notification.

## 3. Turn on the AI concierge

The concierge widget posts each message to `/api/concierge`, which calls
Claude (Anthropic's API) with a system prompt describing your brokerage,
service area, and commission structure.

1. Create an account at [console.anthropic.com](https://console.anthropic.com) and generate an API key.
2. In Cloudflare: same **Environment variables** screen → add:
   - `ANTHROPIC_API_KEY` — your Anthropic key (mark it **Secret**)
3. Redeploy.

Until this key is set, the widget will gracefully fall back to opening
the lead form and asking for a phone number, rather than showing an error.

## 4. What's still a placeholder

- **IDX / live listings**: the concierge and the search bar do not yet
  pull from a real MLS feed. The exact spot to wire this in is marked
  `IDX HOOK-UP POINT` in `functions/api/concierge.js`, and `runIDXSearch()`
  in `index.html`. You'll need an agreement with a provider your MLS board
  supports (Bridge Interactive / RESO Web API, IDX Broker, or SimplyRETS).
- **Community page stats**: median price, active listing counts, and
  drive times on the four community pages (`communities/*.html`) are
  sample figures marked in the page — swap in real MLS-sourced numbers.
- **New developments**: `new-developments.html` shows three sample
  placeholder projects clearly marked in the code — replace with real
  pre-construction projects you actually represent before launch. Do not
  publish invented project names or affiliations.
- **About page**: `about.html` has a placeholder headshot circle and
  sample testimonials — replace with a real photo, bio, and actual
  client quotes (with permission) before launch.
- **BoldTrail CRM**: leads currently go to email only. If you'd rather
  they land directly in BoldTrail, `lead.js` can also POST to BoldTrail's
  Lead Router API/webhook alongside (or instead of) the email — that just
  needs your BoldTrail API key or webhook URL.
- **Photography**: the site uses original vector illustration in place of
  real listing photos, since actual listing photography is copyrighted.
  Swap in your own licensed photos in the `.photo-block` elements once
  IDX is connected or you have images to use.
- **Social links**: the footer Instagram/YouTube/LinkedIn icons on the
  homepage currently link to `#` — point them at your real profiles.

## A note on compliance

The footer includes the Florida-required brokerage disclosure (broker
name, license number, brokerage name and address). Before this goes
live publicly, it's worth having Dalton Wade's broker or compliance team
confirm the disclosure meets FREC's current advertising rule
(61J2-10.025) — I'm not a real estate attorney and can't give a final
legal sign-off on that.
