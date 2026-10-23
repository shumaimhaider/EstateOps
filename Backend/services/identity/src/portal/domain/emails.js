/** The emails the customer portal sends. Pure: data in, { subject, text, html } out. */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const frame = (title, lines, link, linkLabel, footer) => ({
  text: `${[...lines, link ? `${linkLabel}: ${link}` : null].filter(Boolean).join('\n\n')}\n\n${footer}`,
  html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">
<h2 style="font-size:18px">${esc(title)}</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(linkLabel)}</a></p><p style="color:#666;font-size:12px">If the button does not work, copy this address into your browser:<br>${esc(link)}</p>` : ''}
<p style="color:#666;font-size:12px">${esc(footer)}</p></body></html>`,
});

export function inviteEmail({ customerName, developer, link, days }) {
  const subject = `Your ${developer} customer portal account`;
  return {
    subject,
    ...frame(
      subject,
      [
        `Hello ${customerName},`,
        `${developer} has set up your customer portal account. There you can see your properties, your payment schedule and receipts, pay installments, keep a card on file and sign your contracts.`,
        `Choose your password to get started. This link works once and expires in ${days} days.`,
      ],
      link,
      'Choose your password',
      'If you were not expecting this email, you can ignore it.',
    ),
  };
}

export function resetEmail({ customerName, developer, link, minutes }) {
  const subject = `Reset your ${developer} portal password`;
  return {
    subject,
    ...frame(
      subject,
      [
        `Hello ${customerName},`,
        `We received a request to reset the password of your ${developer} customer portal account.`,
        `This link works once and expires in ${minutes} minutes.`,
      ],
      link,
      'Reset your password',
      'If you did not ask for this, ignore this email: your password stays as it is.',
    ),
  };
}

export function passwordChangedEmail({ customerName, developer }) {
  const subject = `Your ${developer} portal password was changed`;
  return {
    subject,
    ...frame(
      subject,
      [
        `Hello ${customerName},`,
        'The password of your customer portal account was just changed, and every other signed-in device was signed out.',
      ],
      null,
      null,
      'If this was not you, use "Forgot password" on the sign-in page straight away, or contact us.',
    ),
  };
}
