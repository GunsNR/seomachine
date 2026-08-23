import { Mail, MapPin, Phone } from 'lucide-react';
import { Section } from '@/components/marketing/Section';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, pageMetadata } from '@/lib/metadata';
import { brand } from '../../../../brand.config';
import { ContactForm } from './ContactForm';

export const metadata = pageMetadata({
  title: 'Contact',
  description: `Talk to the ${brand.name} team about AI search visibility, agency plans or a walkthrough on your own domain. We reply within one business day.`,
  path: '/contact',
});

export default function ContactPage() {
  const tel = brand.phone.replace(/[^+\d]/g, '');
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }])} />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 text-center lg:py-20">
          <p className="eyebrow eyebrow-dark">Contact</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-display-xl text-white text-balance">
            Ask us anything about the channel
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            Happy to run a walkthrough against your own domain so you can see real numbers
            rather than a canned demo.
          </p>
        </div>
      </section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <h2 className="text-display-sm">Other ways to reach us</h2>
            <dl className="mt-7 space-y-6">
              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <dt className="font-heading text-[0.95rem] font-bold text-ink">Phone</dt>
                  <dd className="mt-0.5">
                    <a href={`tel:${tel}`} className="text-[0.9375rem] text-body hover:text-brand">{brand.phone}</a>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <dt className="font-heading text-[0.95rem] font-bold text-ink">Email</dt>
                  <dd className="mt-0.5">
                    <a href={`mailto:${brand.email}`} className="text-[0.9375rem] text-body hover:text-brand">{brand.email}</a>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <dt className="font-heading text-[0.95rem] font-bold text-ink">Office</dt>
                  <dd className="mt-0.5 text-[0.9375rem] leading-relaxed text-body">
                    {brand.address.street}<br />
                    {brand.address.city}, {brand.address.region} {brand.address.postalCode}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <ContactForm />
        </div>
      </Section>
    </>
  );
}
