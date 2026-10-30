import type { FastifyInstance } from 'fastify';
import { activeProviderNames } from '../services/ai/index.js';

// Served by the API itself so the policy lives at a stable HTTPS URL for
// App Store Connect without paying for separate hosting. Linked from the
// app's Settings screen too (App Store 5.1.1(i) wants it in both places).

const EFFECTIVE_DATE = '29 September 2026';

// Named by company so the policy says who actually receives the data.
const PROVIDER_COMPANIES: Record<string, string> = {
  ollama: 'Ollama (ollama.com)',
  'ollama-vision': 'Ollama (ollama.com)',
  zai: 'Zhipu AI (z.ai)',
  gemini: 'Google (Gemini API)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  mistral: 'Mistral AI',
  kimi: 'Moonshot AI (Kimi)',
  openrouter: 'OpenRouter',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function contactLine(): string {
  const email = process.env.SUPPORT_EMAIL;
  return email
    ? `email <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
    : 'use the support link on our App Store page';
}

function aiProviders(): string {
  const names = [...new Set(activeProviderNames().map((n) => PROVIDER_COMPANIES[n] ?? n))];
  return names.length ? names.map(escapeHtml).join(', ') : 'our AI provider';
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · NutriChef</title>
<style>
  body { font: 16px/1.6 -apple-system, system-ui, sans-serif; color: #1f1a17;
         background: #fff9f5; max-width: 680px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 19px; margin-top: 32px; }
  .muted { color: #6b625c; font-size: 14px; }
  a { color: #d9582a; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function privacyPolicy(): string {
  return page(
    'Privacy Policy',
    `<h1>Privacy Policy</h1>
<p class="muted">Effective ${EFFECTIVE_DATE}</p>

<p>NutriChef helps you plan meals, find recipes and track what you eat. This policy
explains what we collect, why, who else sees it, and how to delete it. We do not sell
your data, show ads, or use tracking or analytics SDKs.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account:</strong> your email address, name and password. Passwords are
    stored only as a salted hash.</li>
  <li><strong>Profile:</strong> age, sex, height, weight, activity level, goal, and any
    medical conditions you choose to tell us about (diabetes, high blood pressure,
    high cholesterol, thyroid). We use these to calculate your nutrition targets.</li>
  <li><strong>What you log:</strong> meals, water, weigh-ins, your grocery list, meal
    plan, saved recipes and your conversation with the in-app assistant.</li>
  <li><strong>How you use recipes:</strong> searches, recipes you open, save, log or
    dismiss. This only powers your recommendations.</li>
  <li><strong>Photos and barcodes you scan:</strong> a meal or label photo is sent for
    analysis and then discarded. We do not store your photos.</li>
</ul>
<p>Meal reminders are scheduled on your phone. We do not collect your location,
contacts or device identifiers.</p>

<h2>Who else receives data</h2>
<ul>
  <li><strong>AI provider — only with your permission.</strong> The assistant, the
    photo scanner, pantry ideas and the weekly coach send your message or photo, and a
    short summary of your profile (including any medical conditions), to
    ${aiProviders()}. The app asks before the first time this happens, and you can
    turn it off in Settings at any time. Everything else in the app keeps working
    without it.</li>
  <li><strong>USDA FoodData Central</strong> receives ingredient names to look up
    nutrition values.</li>
  <li><strong>Open Food Facts</strong> receives barcode numbers you scan.</li>
  <li><strong>TheMealDB</strong> receives recipe search terms.</li>
</ul>
<p>The last three never receive your name, email or anything else about you. We only
work with services that protect data at least as well as this policy describes.</p>

<h2>How long we keep it</h2>
<ul>
  <li>Your account and everything you log: until you delete your account.</li>
  <li>Recipe activity used for recommendations: 90 days.</li>
  <li>Sign-in sessions: 30 days.</li>
  <li>Server logs with IP addresses: kept briefly for security, then deleted.</li>
</ul>

<h2>Your choices</h2>
<ul>
  <li><strong>Delete your account:</strong> in the app, go to Settings → Delete account.
    This permanently deletes your account and all of your data right away.</li>
  <li><strong>Withdraw AI permission:</strong> Settings → AI features.</li>
  <li><strong>Edit your profile</strong> at any time in Settings.</li>
  <li>For a copy of your data or any other request, ${contactLine()}.</li>
</ul>

<h2>Security</h2>
<p>Data travels over encrypted connections (HTTPS). Your password is never stored
in readable form.</p>

<h2>Children</h2>
<p>NutriChef is not meant for children under 13, and we do not knowingly collect their
data.</p>

<h2>Health information</h2>
<p>NutriChef gives general nutrition information, not medical advice. Calorie and
nutrient numbers are estimates. Check with your doctor before making changes to your
diet, especially if you have a medical condition.</p>

<h2>Changes</h2>
<p>If we change this policy we will update the date above, and tell you in the app if
the change is significant.</p>

<h2>Contact</h2>
<p>Questions? Please ${contactLine()}.</p>`,
  );
}

function terms(): string {
  return page(
    'Terms of Use',
    `<h1>Terms of Use</h1>
<p class="muted">Effective ${EFFECTIVE_DATE}</p>

<p>By using NutriChef you agree to these terms and to Apple's standard
<a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Licensed
Application End User License Agreement</a>.</p>

<h2>Not medical advice</h2>
<p>NutriChef provides general nutrition and cooking information. It is not a medical
device and does not diagnose, treat or prevent any condition. Nutrition numbers,
photo estimates and assistant answers can be wrong. Always check with your doctor or a
registered dietitian before making medical or major dietary decisions.</p>

<h2>Your account</h2>
<p>Keep your password private. You are responsible for what happens under your
account. You can delete it at any time in Settings.</p>

<h2>Fair use</h2>
<p>Don't misuse the service: no attempts to break it, overload it, or access other
people's data. We may suspend accounts that do.</p>

<h2>No warranty</h2>
<p>NutriChef is provided "as is". To the extent the law allows, we are not liable for
losses arising from its use.</p>

<h2>Contact</h2>
<p>Questions? Please ${contactLine()}.</p>`,
  );
}

export async function legalRoutes(app: FastifyInstance) {
  app.get('/privacy', async (_req, reply) => reply.type('text/html').send(privacyPolicy()));
  app.get('/terms', async (_req, reply) => reply.type('text/html').send(terms()));
}
