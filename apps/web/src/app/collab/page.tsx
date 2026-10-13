import type { Metadata } from 'next';
import { Card } from '../../components/Card';
import { SitePage } from '../../components/SiteChrome';
import { Table } from '../../components/Table';
import { COLLABS } from './record';

export const metadata: Metadata = {
  title: 'Collaborations',
  description:
    'How Mohonaut works with creators, crews and other games: no paid promotion without disclosure, and a public record of every collaboration that involved anything of value.',
};

/** Collaborations (docs/05 §4.8): what we do, what we never do, how to ask, and the record. */
export default function CollabPage() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Collaborations</h1>
      <p className="mt-4 max-w-2xl text-lg">
        We like working with crews, creators and other game teams. We don&apos;t pay for posts, and
        anything of value given in a collaboration is listed on this page.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card title="What we do">
          <ul className="list-disc space-y-2 pl-5">
            <li>Shared cosmetics for crews from other communities: banners, rig paint.</li>
            <li>Joint Spaces and cross devlogs with other game teams.</li>
            <li>
              A Season 0 guide and the <a href="/brand/">press kit</a> for creators, unpaid; we ask
              you to say so.
            </li>
            <li>Highlighting players&apos; guides with a repost or a quote.</li>
          </ul>
        </Card>
        <Card title="What we never do">
          <ul className="list-disc space-y-2 pl-5">
            <li>Tokens, ETH, badges or priority in exchange for posts.</li>
            <li>Paid-per-post boards, engagement scores or social reward pools.</li>
            <li>Paying anyone to post without a clear #ad at the start.</li>
            <li>Price, return or listing talk in anything we agree.</li>
          </ul>
        </Card>
      </div>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">
        Ask for a collaboration
      </h2>
      <p className="mt-4 max-w-2xl">
        Use the <a href="/support/?topic=collab">support form</a> with the topic &quot;A
        collaboration&quot;. Say who you are, where you post and what you have in mind. We never
        send the first private message, and nobody from Mohonaut will ask you for a payment or a
        wallet signature to collaborate.
      </p>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">
        Public record
      </h2>
      <p className="mt-4 max-w-2xl">
        Every collaboration where something of value changed hands: money, tokens, ETH, a valuable
        cosmetic or early access. Invite links count too, which is why shared posts say &quot;(my
        invite link)&quot;.
      </p>
      <div className="mt-6">
        <Table
          caption="Collaborations with a transfer of value"
          rows={[...COLLABS]}
          rowKey={(c) => `${c.date}-${c.who}`}
          empty="None so far."
          columns={[
            { key: 'date', header: 'Date', render: (c) => c.date },
            { key: 'who', header: 'Who', render: (c) => c.who },
            { key: 'value', header: 'What was given', render: (c) => c.value },
            {
              key: 'post',
              header: 'Post',
              render: (c) => (c.post === null ? '—' : <a href={c.post}>Link</a>),
            },
          ]}
        />
      </div>
    </SitePage>
  );
}
