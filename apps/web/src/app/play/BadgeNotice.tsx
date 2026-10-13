'use client';

import { BADGES, BADGE_PALETTE } from '@mohonaut/sdk';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { PixelSvg } from '../../game/pixel/PixelSvg';
import { badgePost, xIntentUrl } from '../../social/share';
import { PxButton, PxModal } from './px';

const key = (address: string) => `mohonaut.badges.${address.toLowerCase()}`;

function seenBadges(address: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key(address));
    return raw === null ? null : (JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

function rememberBadges(address: string, ids: readonly string[]): void {
  try {
    window.localStorage.setItem(key(address), JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the badge may be shown again next time.
  }
}

/** Badges in `now` this device has not shown yet, in catalogue order (pure, for tests). */
export function newBadges(seen: readonly string[], now: readonly string[]): string[] {
  return BADGES.map((b) => b.id).filter((id) => now.includes(id) && !seen.includes(id));
}

/**
 * A new badge since this device last looked: Foreman Mo hands it over once, with a post to
 * share. A first visit only notes the badges already held. Otherwise shows `children`.
 */
export function BadgeNotice({
  address,
  held,
  children,
}: {
  address: Address;
  /** The player's badge ids (the public profile), undefined until it loads. */
  held: readonly string[] | undefined;
  children?: ReactNode;
}) {
  const [shown, setShown] = useState<string[]>([]);
  const fresh =
    held === undefined ? [] : newBadges([...(seenBadges(address) ?? []), ...shown], held);
  useEffect(() => {
    // A first visit: what the player already holds is not news.
    if (held !== undefined && seenBadges(address) === null) rememberBadges(address, held);
  }, [address, held]);
  const first = seenBadges(address) === null ? undefined : fresh[0];
  const badge = BADGES.find((b) => b.id === first);
  if (badge === undefined) return <>{children}</>;
  const close = () => {
    rememberBadges(address, [...(seenBadges(address) ?? []), badge.id]);
    setShown([...shown, badge.id]);
  };
  return (
    <PxModal title="New badge" onClose={close}>
      <div className="flex items-center gap-4">
        <PixelSvg rows={badge.icon} palette={BADGE_PALETTE} size={72} />
        <div>
          <p className="text-2xl text-amber">{badge.name}</p>
          <p className="mt-1">{badge.description}</p>
          <p className="mt-2 text-sm text-concrete">
            Badges are cosmetic: they show on your profile and change nothing in the economy.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <PxButton className="grow" onClick={close}>
          Back to work
        </PxButton>
        <a
          href={xIntentUrl(
            badgePost({ name: badge.name, description: badge.description, address }),
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="px-btn px-btn-dark px-4 py-2 text-lg"
        >
          Share on X
        </a>
      </div>
    </PxModal>
  );
}
