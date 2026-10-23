import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { MailError } from './mailerPort.js';

/** Real email over SMTP. `transport` can be swapped (tests use nodemailer's JSON transport). */
export function createSmtpMailer({ url, from, transport = null }) {
  const smtp = transport ?? nodemailer.createTransport(url);
  return {
    async send({ to, subject, text, html }) {
      try {
        const info = await smtp.sendMail({ from, to, subject, text, html });
        return { id: info.messageId ?? randomUUID() };
      } catch (error) {
        throw new MailError(error.message);
      }
    },
  };
}

/** Development: prints the email instead of sending it. */
export function createConsoleMailer({ logger }) {
  return {
    async send({ to, subject, text }) {
      const id = randomUUID();
      logger.info({ to, subject, id, text }, 'email (not sent: console mailer)');
      return { id };
    },
  };
}

/** Tests: keeps what was sent, and can be told to fail. */
export function createMemoryMailer() {
  const sent = [];
  const failures = [];
  return {
    sent,
    failNext(message = 'mail server down', times = 1) {
      for (let i = 0; i < times; i += 1) failures.push(message);
    },
    async send(message) {
      if (failures.length) throw new MailError(failures.shift());
      const id = randomUUID();
      sent.push({ id, ...message });
      return { id };
    },
  };
}
