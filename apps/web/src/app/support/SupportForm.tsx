'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { isAddress } from 'viem';
import type { Address } from 'viem';
import { Button } from '../../components/Button';
import { SUPPORT_TOPICS, api, apiEnabled, apiMessage } from '../../social/api';
import type { SupportTopic } from '../../social/api';

const TOPIC_LABELS: Record<SupportTopic, string> = {
  account: 'My account or drill site',
  transaction: 'A transaction or refine',
  bug: 'Something looks broken',
  safety: 'A fake site, scam or security issue',
  other: 'Something else',
};
const field = 'mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2';

export function SupportForm() {
  const [topic, setTopic] = useState<SupportTopic>('account');
  const [body, setBody] = useState('');
  const [contact, setContact] = useState('');
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const w = wallet.trim();
      const { id } = await api.support({
        topic,
        body: body.trim(),
        contact: contact.trim() === '' ? null : contact.trim(),
        wallet: isAddress(w, { strict: false }) ? (w as Address) : null,
      });
      setResult({
        ok: true,
        text: `Received as request #${id}. We answer through the contact you gave, usually within two days.`,
      });
      setBody('');
    } catch (err) {
      setResult({ ok: false, text: apiMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!apiEnabled) {
    return (
      <p className="mt-6">
        The support form opens with Season 0. Until then, write to us on X: @playmohonaut.
      </p>
    );
  }
  return (
    <form onSubmit={(e) => void send(e)} className="mt-8 flex flex-col gap-4">
      <label className="block">
        <span className="text-fg-muted">Topic</span>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value as SupportTopic)}
          className={field}
        >
          {SUPPORT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-fg-muted">What happened (10 to 4,000 characters)</span>
        <textarea
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={field}
        />
      </label>
      <label className="block">
        <span className="text-fg-muted">How to reach you: e-mail or X handle (optional)</span>
        <input
          maxLength={254}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className={field}
        />
      </label>
      <label className="block">
        <span className="text-fg-muted">
          Wallet address, if it helps (optional, public address only)
        </span>
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          pattern="0x[0-9a-fA-F]{40}"
          className={`${field} num`}
        />
      </label>
      <p className="text-sm text-fg-muted">
        We keep this message and contact only to answer you (see Privacy).
      </p>
      <Button type="submit" busy={busy} className="self-start">
        Send
      </Button>
      {result !== null && (
        <p role="status" className={result.ok ? 'text-good' : 'text-warn'}>
          {result.text}
        </p>
      )}
    </form>
  );
}
