'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { isAddress } from 'viem';
import type { Address } from 'viem';
import { Button } from '../../components/Button';
import { formatEth } from '../../lib/format';
import { api, apiEnabled, apiMessage } from '../../social/api';
import type { FaucetInfo } from '../../social/api';

const field = 'mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2 num';

export function FaucetForm() {
  const [info, setInfo] = useState<FaucetInfo | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!apiEnabled) return;
    api
      .faucetInfo()
      .then(setInfo)
      .catch(() => setInfo({ enabled: false, amountWei: null, address: null, balanceWei: null }));
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    const a = address.trim();
    if (!isAddress(a, { strict: false })) {
      setResult({
        ok: false,
        text: 'That is not a wallet address (0x followed by 40 characters).',
      });
      return;
    }
    setBusy(true);
    try {
      const r = await api.faucet(a as Address);
      setResult({
        ok: true,
        text: `Sent ${formatEth(BigInt(r.amountWei), 4)} of test ETH. Transaction ${r.txHash.slice(0, 12)}…; it arrives within a minute.`,
      });
    } catch (err) {
      setResult({ ok: false, text: apiMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!apiEnabled || info === null) {
    return (
      <p className="mt-6">
        {apiEnabled ? 'Checking the faucet…' : 'The faucet opens with Season 0.'}
      </p>
    );
  }
  if (!info.enabled) return <p className="mt-6">The faucet is closed right now.</p>;
  return (
    <>
      <form onSubmit={(e) => void send(e)} className="mt-8 flex flex-col gap-4">
        <label className="block">
          <span className="text-fg-muted">Your wallet address (public address only)</span>
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className={field}
          />
        </label>
        <Button type="submit" busy={busy} className="self-start">
          Send me test ETH
        </Button>
        {result !== null && (
          <p role="status" className={result.ok ? 'text-good' : 'text-warn'}>
            {result.text}
          </p>
        )}
      </form>
      <p className="mt-8 text-sm text-fg-muted">
        Each wallet gets{' '}
        {info.amountWei === null ? 'a little' : formatEth(BigInt(info.amountWei), 4)} once a day,
        enough for about a week of play. Faucet wallet{' '}
        <span className="num break-all">{info.address}</span>
        {info.balanceWei !== null && <> holds {formatEth(BigInt(info.balanceWei), 4)}</>}; spare
        test ETH sent there keeps it going for everyone.
      </p>
    </>
  );
}
