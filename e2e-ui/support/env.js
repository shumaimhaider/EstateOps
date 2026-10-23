import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const run = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../.run/${name}`, import.meta.url)), 'utf8'));

/** Where everything runs, written by the global setup. */
export const site = () => run('stack.json');

/** Emails the services "sent" (their console mailer output), newest last. */
export async function mails() {
  const { url } = run('mail.json');
  return (await fetch(url)).json();
}
