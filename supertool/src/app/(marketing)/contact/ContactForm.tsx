'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';

export function ContactForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('sending');
    setError('');

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          company: String(form.get('company') ?? ''),
          website: String(form.get('website') ?? ''),
          message: String(form.get('message') ?? ''),
          fax: String(form.get('fax') ?? ''),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not send your message.');
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message.');
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div className="card flex flex-col items-center p-10 text-center" role="status">
        <CheckCircle2 className="h-12 w-12 text-ok" aria-hidden="true" />
        <h2 className="mt-5 font-heading text-[1.35rem] font-bold text-ink">Message received</h2>
        <p className="mt-2.5 max-w-md text-[0.9375rem] leading-relaxed text-body">
          Thanks — we reply to every enquiry within one business day. If it is urgent, the phone
          number in the footer reaches us directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Your name" required />
        <Field id="email" label="Work email" type="email" required />
        <Field id="company" label="Company" />
        <Field id="website" label="Website" placeholder="yourdomain.com" />
      </div>

      <div className="mt-5">
        <label htmlFor="message" className="block text-[0.85rem] font-semibold text-ink">
          What would you like to know? <span className="text-bad" aria-hidden="true">*</span>
        </label>
        <textarea
          id="message" name="message" required minLength={10} maxLength={4000} rows={5}
          placeholder="Tell us about your site, your current tools, and what you are trying to find out."
          className="mt-1.5 w-full rounded-xl border-0 bg-surface-alt p-4 text-[0.95rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/50 focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Honeypot, hidden from users and assistive tech alike. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="fax">Fax</label>
        <input id="fax" name="fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state === 'error' && (
        <p role="alert" className="mt-5 rounded-xl bg-bad/10 p-4 text-[0.875rem] text-ink ring-1 ring-bad/25">
          {error}
        </p>
      )}

      <button type="submit" disabled={state === 'sending'} className="btn btn-lg btn-accent mt-6 w-full sm:w-auto">
        {state === 'sending' ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          <>
            <Send className="h-4.5 w-4.5" aria-hidden="true" />
            Send message
          </>
        )}
      </button>
      <p className="mt-3 text-[0.8rem] text-body">
        We reply within one business day. No sales sequence, no newsletter signup.
      </p>
    </form>
  );
}

function Field({
  id, label, type = 'text', required, placeholder,
}: { id: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.85rem] font-semibold text-ink">
        {label}
        {required && <span className="ml-1 text-bad" aria-hidden="true">*</span>}
      </label>
      <input
        id={id} name={id} type={type} required={required} placeholder={placeholder} maxLength={255}
        className="mt-1.5 h-12 w-full rounded-xl border-0 bg-surface-alt px-4 text-[0.95rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/50 focus:ring-2 focus:ring-brand"
      />
    </div>
  );
}
