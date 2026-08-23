import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';
import { JsonLd } from '@/components/JsonLd';
import { organizationSchema, websiteSchema } from '@/lib/metadata';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema()]} />
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
