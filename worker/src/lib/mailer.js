// Invio email (verifica indirizzo e notifiche). Provider configurabile con i secret/vars del Worker:
//   EMAIL_PROVIDER = brevo | resend | log   (log = non invia, scrive solo nei log: utile in sviluppo)
//   EMAIL_API_KEY  = chiave API del provider            (npx wrangler secret put EMAIL_API_KEY)
//   EMAIL_FROM     = mittente verificato sul provider   (es. lptcoach.app@gmail.com)
//   EMAIL_FROM_NAME = nome mittente (default "LPT Coach")
//   APP_URL        = indirizzo dell'app (default https://lpt-coach.pages.dev)
// Senza configurazione l'invio viene saltato senza errori: l'app funziona lo stesso.

export const appUrl = (env) => (env?.APP_URL || 'https://lpt-coach.pages.dev').replace(/\/$/, '');

export function emailConfigured(env) {
  const provider = String(env?.EMAIL_PROVIDER || '').toLowerCase();
  if (provider === 'log') return true;
  return !!(provider && env?.EMAIL_API_KEY && env?.EMAIL_FROM);
}

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Email con lo stile dell'app: titolo, testo e pulsante
export function emailLayout({ title, text, buttonLabel, buttonUrl, footer }) {
  const paragraphs = String(text || '').split('\n').filter(Boolean).map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#344054">${escapeHtml(line)}</p>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;background:#F2F4F7;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0B3D91;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">LPT Coach</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 14px;font-size:20px;color:#101828">${escapeHtml(title)}</h1>
${paragraphs}
${buttonUrl ? `<p style="margin:20px 0 6px"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#0B3D91;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${escapeHtml(buttonLabel || 'Apri LPT Coach')}</a></p>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;background:#F9FAFB;color:#667085;font-size:12px;line-height:18px">${escapeHtml(footer || 'Ricevi questa email perché hai un account su LPT Coach. Puoi disattivare le notifiche via email dal tuo Profilo.')}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendEmail(env, { to, subject, html, text }) {
  if (!to || !emailConfigured(env)) return { sent: false, reason: 'non configurato' };
  const provider = String(env.EMAIL_PROVIDER).toLowerCase();
  const fromName = env.EMAIL_FROM_NAME || 'LPT Coach';
  try {
    if (provider === 'log') {
      console.log(`[email] a ${to}: ${subject}`);
      globalThis.__sentEmails = [...(globalThis.__sentEmails || []), { to, subject, text, html }];
      return { sent: true };
    }
    let response;
    if (provider === 'brevo') {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.EMAIL_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email: env.EMAIL_FROM, name: fromName }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      });
    } else if (provider === 'resend') {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: `${fromName} <${env.EMAIL_FROM}>`, to: [to], subject, html, text }),
      });
    } else {
      return { sent: false, reason: `provider ${provider} non supportato` };
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      console.error(`Email non inviata (${provider} ${response.status}): ${detail}`);
      return { sent: false, reason: `${response.status} ${detail}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('Email non inviata:', error?.message);
    return { sent: false, reason: error?.message };
  }
}

// token casuale da mettere nel link + hash da salvare nel database
export async function newEmailToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { token, hash: await sha256(token) };
}
export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
