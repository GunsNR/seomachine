import { requireStaffPage } from "@/lib/auth";
import { Flash, PageHeader, Section, SubmitButton } from "@/components/ui";
import { randomToken } from "@/lib/crypto";
import { importCsvAction, manualLeadAction } from "../actions";

export const metadata = { title: "Add a lead" };

export default async function NewLead({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireStaffPage("crm.write");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Add a lead" description="Typed in by you, or imported from a spreadsheet. Same person (same email) is never duplicated." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Section title="Enter one lead">
          <form action={manualLeadAction} className="grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="idempotencyKey" value={randomToken(12)} />
            <div><label className="label" htmlFor="firstName">First name</label><input id="firstName" name="firstName" className="field" autoComplete="off" /></div>
            <div><label className="label" htmlFor="lastName">Last name</label><input id="lastName" name="lastName" className="field" autoComplete="off" /></div>
            <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="field" autoComplete="off" /></div>
            <div><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" className="field" autoComplete="off" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="service">What do they need?</label><input id="service" name="service" className="field" placeholder="e.g. Water heater replacement" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="message">Notes</label><textarea id="message" name="message" rows={3} className="field" /></div>
            <div><label className="label" htmlFor="source">Where did they come from?</label>
              <select id="source" name="source" className="field" defaultValue="unknown"><option value="unknown">Don’t know</option><option value="phone">Phone call</option><option value="referral">Referral</option><option value="google">Google</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="event">Event</option><option value="walk_in">Walk-in</option></select>
              <p className="hint">“Don’t know” stays unknown in reports — we don’t guess.</p></div>
            <div><label className="label" htmlFor="campaign">Campaign (optional)</label><input id="campaign" name="campaign" className="field" /></div>
            <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consentEmail" className="mt-1 h-4 w-4" /><span>They agreed to be emailed about this inquiry</span></label>
            <p className="hint sm:col-span-2">Add an email or a phone number. Leave the other blank if you don’t have it.</p>
            <div className="sm:col-span-2"><SubmitButton>Add lead</SubmitButton></div>
          </form>
        </Section>
        <Section title="Import a CSV">
          <form action={importCsvAction} className="flex flex-col gap-3 p-4">
            <div><label className="label" htmlFor="file">CSV file (max 2 MB, 2,000 rows)</label><input id="file" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-ctl file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm" /></div>
            <p className="hint">Columns we read: first_name, last_name, email, phone, service, notes, source, medium, campaign. Rows with neither email nor phone are skipped and counted.</p>
            <SubmitButton variant="secondary" className="self-start">Import</SubmitButton>
          </form>
        </Section>
      </div>
    </>
  );
}
