import { beforeEach, describe, expect, it } from 'vitest';
import {
  emailConfigured, emailProvider, passwordChangedEmail, passwordResetEmail, welcomeEmail,
} from '@/lib/email';

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.POSTMARK_SERVER_TOKEN;
});

describe('provider selection', () => {
  it('falls back to console when nothing is configured', () => {
    expect(emailProvider()).toBe('console');
    expect(emailConfigured()).toBe(false);
  });

  it('prefers Resend when both are configured', () => {
    process.env.RESEND_API_KEY = 'x';
    process.env.POSTMARK_SERVER_TOKEN = 'y';
    expect(emailProvider()).toBe('resend');
    expect(emailConfigured()).toBe(true);
  });

  it('uses Postmark when only it is configured', () => {
    process.env.POSTMARK_SERVER_TOKEN = 'y';
    expect(emailProvider()).toBe('postmark');
  });
});

describe('passwordResetEmail', () => {
  const message = passwordResetEmail('user@example.com', 'Dana', 'tok_abc123');

  it('addresses the recipient and carries the token in the link', () => {
    expect(message.to).toBe('user@example.com');
    expect(message.text).toContain('tok_abc123');
    expect(message.html).toContain('tok_abc123');
  });

  it('always includes a plain-text body', () => {
    // Some clients never render HTML; a text-only reader must still be able
    // to reset their password.
    expect(message.text.length).toBeGreaterThan(50);
  });

  it('says the link is single-use and time-limited', () => {
    expect(message.text).toMatch(/once/i);
    expect(message.text).toMatch(/expires/i);
  });

  it('tells a recipient who did not request it that they can ignore it', () => {
    expect(message.text).toMatch(/ignore/i);
  });

  it('url-encodes the token', () => {
    const tricky = passwordResetEmail('a@b.com', 'X', 'tok/with+chars=');
    expect(tricky.html).toContain('tok%2Fwith%2Bchars%3D');
  });

  it('escapes the recipient name so it cannot inject markup', () => {
    const hostile = passwordResetEmail('a@b.com', '<script>alert(1)</script>', 'tok_x');
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain('&lt;script&gt;');
  });
});

describe('welcomeEmail', () => {
  it('points at onboarding and names the trial length', () => {
    const message = welcomeEmail('new@example.com', 'Sam');
    expect(message.html).toContain('/app/onboarding');
    expect(message.text).toMatch(/14 days/);
    expect(message.text).toContain('Sam');
  });
});

describe('passwordChangedEmail', () => {
  it('is a security notice with a reply path', () => {
    const message = passwordChangedEmail('user@example.com', 'Dana');
    expect(message.subject).toMatch(/password was changed/i);
    expect(message.replyTo).toBeTruthy();
    expect(message.text).toMatch(/was not/i);
  });
});
