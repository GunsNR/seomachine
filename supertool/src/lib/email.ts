import 'server-only';
import { brand } from '../../brand.config';

/**
 * Transactional email.
 *
 * Providers are reached over their HTTP APIs so no SMTP dependency is needed.
 * With none configured, mail is logged to the server console instead of being
 * silently dropped — in development that is what you want, and in production
 * the health endpoint reports that email is unconfigured.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Required — some clients never render the HTML. */
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SendResult {
  ok: boolean;
  provider: 'resend' | 'postmark' | 'console';
  id?: string;
  error?: string;
}

export type EmailProvider = SendResult['provider'];

export function emailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.POSTMARK_SERVER_TOKEN) return 'postmark';
  return 'console';
}

export function emailConfigured(): boolean {
  return emailProvider() !== 'console';
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || `${brand.name} <${brand.email}>`;
}

/**
 * Sends a message. Never throws: a failed welcome email must not fail the
 * signup that triggered it. The result says what happened.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const provider = emailProvider();

  if (provider === 'console') {
    console.info(
      [
        '',
        '─── email (no provider configured, not sent) ───',
        `To:      ${message.to}`,
        `From:    ${fromAddress()}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
        '───────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return { ok: true, provider: 'console' };
  }

  try {
    return provider === 'resend' ? await sendViaResend(message) : await sendViaPostmark(message);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown email error';
    console.error(`email: ${provider} send failed`, error);
    return { ok: false, provider, error };
  }
}

async function sendViaResend(message: EmailMessage): Promise<SendResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, provider: 'resend', error: body.message ?? `HTTP ${res.status}` };
  return { ok: true, provider: 'resend', id: body.id };
}

async function sendViaPostmark(message: EmailMessage): Promise<SendResult> {
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN ?? '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      From: fromAddress(),
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
      ...(message.html ? { HtmlBody: message.html } : {}),
      ...(message.replyTo ? { ReplyTo: message.replyTo } : {}),
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { MessageID?: string; Message?: string };
  if (!res.ok) return { ok: false, provider: 'postmark', error: body.Message ?? `HTTP ${res.status}` };
  return { ok: true, provider: 'postmark', id: body.MessageID };
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || brand.url).replace(/\/$/, '');
}

/** Minimal, table-free HTML. Deliverability matters more than art direction. */
function wrap(heading: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f9fd;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1220">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${brand.colors.primary}">${escape(brand.name)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escape(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#4a5568">${escape(p)}</p>`).join('\n')}
${cta ? `<p style="margin:24px 0 0"><a href="${escape(cta.url)}" style="display:inline-block;background:${brand.colors.accent};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">${escape(cta.label)}</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#8a94a6;word-break:break-all">If the button does not work, paste this into your browser:<br>${escape(cta.url)}</p>` : ''}
</div>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a94a6;text-align:center">${escape(brand.legalName)}</p>
</body></html>`;
}

export function passwordResetEmail(to: string, name: string, token: string): EmailMessage {
  const url = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const paragraphs = [
    `Hi ${name}, someone asked to reset the password for this ${brand.shortName} account.`,
    'This link works once and expires in one hour.',
    'If that was not you, you can ignore this email — nothing has changed and your password still works.',
  ];

  return {
    to,
    subject: `Reset your ${brand.shortName} password`,
    text: `${paragraphs.join('\n\n')}\n\nReset your password:\n${url}\n\n— ${brand.name}`,
    html: wrap('Reset your password', paragraphs, { label: 'Reset password', url }),
  };
}

export function welcomeEmail(to: string, name: string): EmailMessage {
  const url = `${baseUrl()}/app/onboarding`;
  const paragraphs = [
    `Welcome, ${name}. Your ${brand.shortName} workspace is ready.`,
    'Next step is to point it at your domain. We read your homepage, pull out the topics you already cover, and build a prompt set around your category and competitors — that takes about a minute and gives you a baseline to measure against.',
    'Your trial runs for 14 days and needs no card.',
  ];

  return {
    to,
    subject: `Welcome to ${brand.shortName}`,
    text: `${paragraphs.join('\n\n')}\n\nSet up your workspace:\n${url}\n\n— ${brand.name}`,
    html: wrap(`Welcome to ${brand.shortName}`, paragraphs, { label: 'Set up my workspace', url }),
  };
}

export function passwordChangedEmail(to: string, name: string): EmailMessage {
  const paragraphs = [
    `Hi ${name}, the password on your ${brand.shortName} account was just changed.`,
    'If that was you, no action is needed.',
    `If it was not, reply to this email immediately — someone may have access to your account.`,
  ];

  return {
    to,
    subject: `Your ${brand.shortName} password was changed`,
    text: `${paragraphs.join('\n\n')}\n\n— ${brand.name}`,
    html: wrap('Your password was changed', paragraphs),
    replyTo: brand.email,
  };
}
