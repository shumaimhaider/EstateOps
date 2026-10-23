/**
 * What billing needs to send an email. Adapters: SMTP (nodemailer), a console mailer for
 * development, and an in-memory one for tests.
 *   send({ to, subject, text, html }) -> { id }   (throws on failure so the event is retried)
 */
export class MailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MailError';
  }
}

export function assertMailer(mailer) {
  if (typeof mailer?.send !== 'function') throw new Error('The mailer needs a send() method');
  return mailer;
}
