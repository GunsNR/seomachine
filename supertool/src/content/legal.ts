import { brand } from '../../brand.config';

export interface LegalSection { heading: string; body: string[] }

export const PRIVACY_UPDATED = '2026-08-01';
export const TERMS_UPDATED = '2026-08-01';

export const PRIVACY: LegalSection[] = [
  {
    heading: 'What this policy covers',
    body: [
      `This policy explains what ${brand.name} collects when you use our website and platform, why we collect it, and what control you have over it. It applies to ${brand.domain} and to the SuperTool application.`,
      'It does not cover third-party websites we link to, which have their own policies.',
    ],
  },
  {
    heading: 'Information we collect',
    body: [
      'Account information you give us: name, work email, company name and billing details. Billing details are handled by our payment processor and are never stored on our servers.',
      'Project data you configure: the domains, keywords, prompts and competitors you choose to track, plus content you submit for scoring.',
      'Data we generate: the answers returned by answer engines for your prompts, crawl results for the sites you audit, and the scores derived from both.',
      'Usage data: pages visited, features used, and technical information such as browser type and IP address, used to keep the service secure and working.',
    ],
  },
  {
    heading: 'How we use it',
    body: [
      'To provide the service — running checks, storing history, generating scores and reports.',
      'To communicate with you about your account, including service notices and support replies.',
      'To improve the product in aggregate. We do not train models on your project content, and we do not sell your data to anyone, ever.',
    ],
  },
  {
    heading: 'Answer engine providers',
    body: [
      'Running a visibility check means sending your prompt text to the provider whose engine is being checked — OpenAI, Anthropic, Perplexity, Google or xAI. Prompts typically contain your brand name, your category and your competitors.',
      'We do not send your account details, your customer data or your unpublished content to these providers as part of a visibility check.',
      'On the Scale plan you may supply your own provider credentials, in which case those calls are made under your account and governed by your agreement with that provider.',
    ],
  },
  {
    heading: 'The website tracking snippet',
    body: [
      'The optional attribution snippet sets no cookies and stores no personal data by default. It records that a visit arrived from a known answer-engine referrer and which page it landed on.',
      'If you enable lead capture, the form and the data it collects are yours; your own privacy notice governs it.',
    ],
  },
  {
    heading: 'Retention and deletion',
    body: [
      'Project data is retained while your account is active. After cancellation we keep it for 30 days so you can reactivate, then delete it permanently.',
      'You can export everything — prompts, checks, rankings, audits, articles — as CSV or JSON at any time, including after cancellation.',
      'You can request immediate deletion by emailing ' + brand.email + ' and we will action it within 30 days.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'Depending on where you live you may have rights to access, correct, export or delete your personal data, and to object to certain processing. Email ' + brand.email + ' to exercise any of them.',
      'We will not discriminate against you for exercising these rights.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'Data is encrypted in transit and at rest. Access to production systems is restricted, logged and reviewed.',
      'No system is perfectly secure. If a breach affects your data we will notify you promptly and tell you what happened.',
    ],
  },
  {
    heading: 'Changes and contact',
    body: [
      'If we change this policy materially we will notify account holders by email before the change takes effect.',
      `Questions go to ${brand.email}, or ${brand.address.street}, ${brand.address.city}, ${brand.address.region} ${brand.address.postalCode}.`,
    ],
  },
];

export const TERMS: LegalSection[] = [
  {
    heading: 'Agreement',
    body: [
      `These terms govern your use of ${brand.name}, operated by ${brand.legalName}. By creating an account you agree to them.`,
      'If you are agreeing on behalf of a company, you confirm you have authority to bind that company.',
    ],
  },
  {
    heading: 'The service',
    body: [
      'SuperTool measures brand visibility across answer engines and search engines, audits websites, scores content and publishes to connected sites.',
      'We may change or improve features over time. If we remove something material from your plan we will tell you in advance.',
    ],
  },
  {
    heading: 'What we do not promise',
    body: [
      'Answer engines are operated by third parties, are non-deterministic, and change their behaviour without notice. We report what they return; we cannot guarantee any particular result, ranking, citation or traffic outcome.',
      'Metrics derived from third-party sources are estimates. We are explicit in the product about which numbers are measured and which are modelled.',
      'The service is provided as is, without warranties of any kind to the fullest extent permitted by law.',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      'Do not use the service to crawl sites you have no right to crawl, to violate any provider’s terms, to attempt to overwhelm any third-party system, or to break the law.',
      'Do not resell raw API access unless your plan explicitly permits it.',
      'We may suspend accounts that put the platform or its other users at risk, and we will tell you why.',
    ],
  },
  {
    heading: 'Your content and data',
    body: [
      'You keep all rights to the content and data you put into SuperTool. You grant us only the licence needed to run the service for you.',
      'We do not train models on your content and we do not sell your data.',
    ],
  },
  {
    heading: 'Billing',
    body: [
      'Plans bill monthly or annually in advance. Trials require no card and convert only if you choose to subscribe.',
      'You can cancel at any time; your plan runs until the end of the paid period and does not renew.',
      'If you are unhappy within 30 days of your first payment, email us and we will refund it.',
    ],
  },
  {
    heading: 'Liability',
    body: [
      'To the extent permitted by law, our total liability arising from the service is limited to the amount you paid us in the twelve months before the claim.',
      'Neither party is liable for indirect or consequential losses.',
    ],
  },
  {
    heading: 'Termination and changes',
    body: [
      'Either party may end this agreement at any time. On termination you can export your data for 30 days.',
      `We may update these terms; material changes are notified by email at least 30 days in advance. Questions go to ${brand.email}.`,
    ],
  },
];
