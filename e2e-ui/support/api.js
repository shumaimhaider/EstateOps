import { createTotp } from '../../Backend/services/identity/src/auth/infrastructure/totp.js';
import { createWorld } from '../../Backend/e2e/support/world.js';
import { eventually } from '../../Backend/e2e/support/http.js';
import { mails, site } from './env.js';

export const totp = createTotp();
export { eventually };

/** The same API-driven seeding the back-end journeys use, pointed at the running stack. */
export function world() {
  const s = site();
  return createWorld({ gatewayUrl: s.gatewayUrl, urls: s.urls, stripe: { url: s.stripeUrl }, pandadoc: { url: s.pandadocUrl }, mails: [] });
}

/** The link in the email sent to `email` (an invitation or reset), waiting for it to arrive. */
export async function emailedLink(email, pattern = /set-password|reset-password/) {
  const mail = await eventually(async () => (await mails()).find((m) => m.to === email && pattern.test(m.text ?? '')), { what: `email to ${email}` });
  return new URL(/https?:\/\/\S+/.exec(mail.text.slice(mail.text.search(pattern) - 80))[0].replace(/[).,]+$/, ''));
}

export const A = '/api/v1/admin';
