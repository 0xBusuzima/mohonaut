import type { Metadata } from 'next';
import { SitePage } from '../../components/SiteChrome';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Short answers about Mohonaut: $MOHN, your share, diesel, rules, audits and refining.',
};

const FAQ = [
  [
    'What is $MOHN used for?',
    'Buying rigs and site upgrades in the Equipment Market. 80% of in-game $MOHN spend is burned for good; 20% returns to the reserve.',
  ],
  [
    'How is my share calculated?',
    "Each hour, 90% of that hour's slice of the reserve is split by active Drill Power: your share is your active DP divided by the network's. More players means a smaller share each.",
  ],
  [
    'What do I pay ETH for?',
    "Diesel. ETH from fuel is routed 55% to buyback & burn, 30% to protocol liquidity that can't be withdrawn, 15% to operations. Published weekly.",
  ],
  [
    'Can the team change the rules?',
    "Some things can't change at all: the token, the cap, the emission schedule, the 90/5/5 split, the burn ratio and existing rigs. Everything else has hard limits in code and waits 96 hours in a public queue.",
  ],
  [
    'Is it audited?',
    'Not yet. What we did instead, and when an independent audit happens, is on the Security page.',
  ],
  [
    'When can I withdraw my $MOHN?',
    'Mined $MOHN goes through the Refinery: free with a 72-hour queue, or instant for an 8% fee (half burned, half returned to the reserve). Refining is closed during the 72 hours of Genesis, and there is no pool before Market Open. We don’t comment on price.',
  ],
  [
    'Is $MOHO your token?',
    'No. Our ticker is $MOHN, and the only address is on the Contracts page.',
  ],
  ['Do you DM people?', 'Never first. Anyone who messages you about Mohonaut first is not us.'],
];

export default function FaqPage() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">FAQ</h1>
      <dl className="mt-8 flex flex-col gap-6">
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <dt className="text-lg font-semibold">{q}</dt>
            <dd className="mt-1 text-fg-muted">{a}</dd>
          </div>
        ))}
      </dl>
      <script
        type="application/ld+json"
        // Structured data for search (docs/05 §3.6): FAQPage.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map(([q, a]) => ({
              '@type': 'Question',
              name: q,
              acceptedAnswer: { '@type': 'Answer', text: a },
            })),
          }),
        }}
      />
    </SitePage>
  );
}
