'use client';

import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Tabs } from '../../components/Tabs';
import type { Tab } from '../../components/Tabs';
import { WalletProviders } from '../../game/WalletProviders';
import { useE2EConnect } from '../../game/e2e';
import { useNow } from '../../lib/clock';
import { can } from '../../ops/permissions';
import {
  AnnouncementsScreen,
  AuditScreen,
  CrewsScreen,
  HealthScreen,
  PlayersScreen,
  RolesScreen,
  SeasonsScreen,
  SupportScreen,
} from '../../ops/screens';
import { apiEnabled } from '../../social/api';
import { useMe } from '../../social/session';

export function OpsApp() {
  return (
    <WalletProviders>
      <div className="min-h-dvh">
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <p className="font-display text-2xl font-black tracking-wide uppercase">
            <span className="text-orange">Mohonaut</span> Ops
          </p>
          <ConnectButton chainStatus="none" showBalance={false} />
        </header>
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-16">
          <h1 className="sr-only">Operator panel</h1>
          <OpsBody />
        </main>
      </div>
    </WalletProviders>
  );
}

function OpsBody() {
  useE2EConnect();
  const { isConnected } = useAccount();
  const { me, loading } = useMe();
  const { openConnectModal } = useConnectModal();
  const nowMs = useNow(60_000);
  if (!apiEnabled) return <p>The API is not configured for this build (NEXT_PUBLIC_API_URL).</p>;
  if (loading) return <p role="status">Checking your session…</p>;
  if (me === null) {
    return (
      <Card title="Sign in">
        <p>Operators sign in with their wallet (SIWE). Roles come from the API.</p>
        <Button
          className="mt-4"
          onClick={() => openConnectModal?.()}
          disabled={openConnectModal === undefined}
        >
          {isConnected ? 'Sign in' : 'Connect wallet'}
        </Button>
      </Card>
    );
  }
  if (me.roles.length === 0) {
    return (
      <Card title="No operator role">
        <p>Your account (#{me.id}) has no operator role. An admin can grant one under Access.</p>
      </Card>
    );
  }
  const now = Math.floor((nowMs ?? 0) / 1000);
  const r = me.roles;
  const all: (Tab | false)[] = [
    can(r, 'health.read') && { id: 'health', label: 'Health', content: <HealthScreen /> },
    can(r, 'users.read') && {
      id: 'players',
      label: 'Players',
      content: <PlayersScreen canFlag={can(r, 'users.flag')} />,
    },
    can(r, 'support.read') && {
      id: 'support',
      label: 'Support',
      content: <SupportScreen canWrite={can(r, 'support.write')} />,
    },
    can(r, 'announcements.write') && {
      id: 'news',
      label: 'Announcements',
      content: <AnnouncementsScreen now={now} />,
    },
    can(r, 'seasons.write') && { id: 'seasons', label: 'Seasons', content: <SeasonsScreen /> },
    can(r, 'crews.moderate') && { id: 'crews', label: 'Crews', content: <CrewsScreen /> },
    can(r, 'roles.write') && { id: 'roles', label: 'Access', content: <RolesScreen /> },
    can(r, 'audit.read') && { id: 'audit', label: 'Audit', content: <AuditScreen /> },
  ];
  const tabs = all.filter((t): t is Tab => t !== false);
  return (
    <>
      <p className="text-fg-muted">
        Signed in as #{me.id} ({r.join(', ')}). No private keys live here: on-chain changes are Safe
        transactions.
      </p>
      <Tabs label="Operator screens" tabs={tabs} />
    </>
  );
}
