'use client';

import { useSyncExternalStore } from 'react';

/**
 * Low-power mode (docs/06 4.5): no scene animation, a slower counter and slower chain reads.
 * On by default for data-saver connections and small devices; the player's choice overrides
 * it and is remembered on this device.
 */
const KEY = 'mohonaut.lowPower';
const listeners = new Set<() => void>();

interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function lowPowerByDefault(nav: DeviceHints): boolean {
  if (nav.connection?.saveData === true) return true;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return true;
  return nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2;
}

function stored(): boolean | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null; // storage blocked: fall back to the device default
  }
}

function snapshot(): boolean {
  return stored() ?? lowPowerByDefault(navigator as DeviceHints);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Used only when storage is blocked: the choice then lasts until the page closes. */
let override: boolean | null = null;

export function setLowPower(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
    override = null;
  } catch {
    override = on;
  }
  for (const l of listeners) l();
}

export function useLowPower(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => override ?? snapshot(),
    () => false,
  );
}
