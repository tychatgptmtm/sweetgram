// Отправка кода. Поддерживаются Brevo и Resend (HTTP API — работает на бесплатном Render,
// где исходящий SMTP заблокирован). Без ключей код просто печатается в логи.
const FROM = process.env.MAIL_FROM || '';
const FROM_NAME = process.env.MAIL_FROM_NAME || 'sweetgram';

function html(code) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:auto;padding:24px;color:#111">
    <h2 style="margin:0 0 12px;font-weight:600">${FROM_NAME}</h2>
    <p style="margin:0 0 16px;color:#555">Ваш код для входа:</p>
    <div style="font-size:34px;letter-spacing:8px;font-weight:700">${code}</div>
    <p style="margin:16px 0 0;color:#888;font-size:13px">Код действует 10 минут. Если это были не вы — просто проигнорируйте письмо.</p></div>`;
}

async function sendCode(email, code) {
  const subject = `${code} — код входа в ${FROM_NAME}`;
  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: FROM, name: FROM_NAME }, to: [{ email }], subject, htmlContent: html(code) }),
    });
    if (!r.ok) throw new Error('Brevo: ' + r.status + ' ' + (await r.text()));
    return;
  }
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: `${FROM_NAME} <${FROM || 'onboarding@resend.dev'}>`, to: [email], subject, html: html(code) }),
    });
    if (!r.ok) throw new Error('Resend: ' + r.status + ' ' + (await r.text()));
    return;
  }
  console.log(`[mail] почта не настроена. Код для ${email}: ${code}`);
}

module.exports = { sendCode };
