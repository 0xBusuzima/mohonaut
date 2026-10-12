'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * The site's sound (docs/01 §7, "industrial ambient"): rain, a diesel generator's throb and
 * now and then a pipe clank, all synthesised in the browser (no recordings, nothing to
 * license). Off until the player turns it on; the choice is remembered on this device.
 */
const KEY = 'mohonaut.sound';
const listeners = new Set<() => void>();
let override: boolean | null = null;

function stored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setSound(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
    override = null;
  } catch {
    override = on;
  }
  for (const l of listeners) l();
}

export function useSound(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => override ?? stored(),
    () => false,
  );
}

/** Two seconds of white noise, looped for rain and used in bursts for clanks. */
function noise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Starts the ambience; gives back a function that fades it out and closes the context. */
function startAmbience(): () => void {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return () => {};
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
  master.connect(ctx.destination);
  const white = noise(ctx);
  // Turned on in an earlier visit: the browser holds the audio until the first tap or click.
  const wake = () => void ctx.resume();
  if (ctx.state === 'suspended') window.addEventListener('pointerdown', wake, { once: true });

  // Rain: noise through a low-pass, softly.
  const rain = ctx.createBufferSource();
  rain.buffer = white;
  rain.loop = true;
  const rainTone = ctx.createBiquadFilter();
  rainTone.type = 'lowpass';
  rainTone.frequency.value = 1400;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.05;
  rain.connect(rainTone).connect(rainGain).connect(master);
  rain.start();

  // Diesel generator: two detuned saws, low-passed, with a slow throb.
  const hum = ctx.createGain();
  hum.gain.value = 0.035;
  const humTone = ctx.createBiquadFilter();
  humTone.type = 'lowpass';
  humTone.frequency.value = 160;
  humTone.connect(hum).connect(master);
  const engines = [43, 43.6].map((f) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(humTone);
    o.start();
    return o;
  });
  const throb = ctx.createOscillator();
  throb.frequency.value = 1.7;
  const throbDepth = ctx.createGain();
  throbDepth.gain.value = 0.012;
  throb.connect(throbDepth).connect(hum.gain);
  throb.start();

  // A pipe clank every 7 to 16 seconds: a short band-passed burst with a ringing tail.
  let timer = 0;
  const clank = () => {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = white;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900 + Math.random() * 1400;
    band.Q.value = 18;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(band).connect(env).connect(master);
    src.start(t, Math.random(), 0.7);
    timer = window.setTimeout(clank, 7000 + Math.random() * 9000);
  };
  timer = window.setTimeout(clank, 3000);

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('pointerdown', wake);
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.4);
    window.setTimeout(() => {
      for (const o of [...engines, throb]) o.stop();
      rain.stop();
      void ctx.close();
    }, 500);
  };
}

/** Plays the ambience while `on` (the toggle is a click, so browsers allow the audio). */
export function useAmbience(on: boolean): void {
  useEffect(() => {
    if (!on) return undefined;
    return startAmbience();
  }, [on]);
}
