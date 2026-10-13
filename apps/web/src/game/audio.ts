'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

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

/**
 * The bore's drone for each stratum (docs/01 4.6, 7: a new theme at every crossing): a step
 * down a minor scale per stratum, from G2 at the surface to G1 an octave below.
 */
export function droneHz(stratum: number): number {
  const steps = [0, 2, 3, 5, 7, 8, 10, 12];
  const down = steps[Math.max(0, Math.min(steps.length - 1, stratum))] ?? 0;
  return Math.round(98 * 2 ** (-down / 12) * 100) / 100;
}

interface Ambience {
  /** Glides the drone to another stratum's note (no new audio context: iOS would hold it). */
  tune: (stratum: number) => void;
  /** Fades the ambience out and closes the context. */
  stop: () => void;
}

/** Starts the ambience with the drone of `stratum`. */
function startAmbience(stratum: number): Ambience {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return { tune: () => {}, stop: () => {} };
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

  // The bore's drone: a low sine for the stratum being cored, breathing slowly.
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = droneHz(stratum);
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.03;
  drone.connect(droneGain).connect(master);
  drone.start();
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.08;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = 0.015;
  breath.connect(breathDepth).connect(droneGain.gain);
  breath.start();

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

  const tune = (s: number) => {
    drone.frequency.setTargetAtTime(droneHz(s), ctx.currentTime, 2);
  };
  const stop = () => {
    window.clearTimeout(timer);
    window.removeEventListener('pointerdown', wake);
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.4);
    window.setTimeout(() => {
      for (const o of [...engines, throb, drone, breath]) o.stop();
      rain.stop();
      void ctx.close();
    }, 500);
  };
  return { tune, stop };
}

/**
 * Plays the ambience while `on` (the toggle is a click, so browsers allow the audio), with the
 * drone of `stratum` (its index); a crossing glides the drone to the new stratum's note.
 */
export function useAmbience(on: boolean, stratum = 0): void {
  const running = useRef<Ambience | null>(null);
  const latest = useRef(stratum);
  useEffect(() => {
    latest.current = stratum;
    running.current?.tune(stratum);
  }, [stratum]);
  useEffect(() => {
    if (!on) return undefined;
    const ambience = startAmbience(latest.current);
    running.current = ambience;
    return () => {
      running.current = null;
      ambience.stop();
    };
  }, [on]);
}

/** One-shot sounds for what the player just did. */
export type Cue = 'buy' | 'fuel' | 'refine' | 'upgrade' | 'switch' | 'scrap' | 'error';

let cueCtx: AudioContext | null = null;

/** Plays a short synthesised cue when sound is on (no recordings). */
export function cue(kind: Cue): void {
  if (!(override ?? stored())) return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return;
  cueCtx ??= new Ctor();
  const ctx = cueCtx;
  void ctx.resume();
  const t = ctx.currentTime;
  const tone = (freq: number, at: number, dur: number, type: OscillatorType, gain: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t + at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + at);
    g.gain.linearRampToValueAtTime(gain, t + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t + at);
    o.stop(t + at + dur + 0.05);
    return o;
  };
  const thud = (at: number, freq: number, gain: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.25);
    src.connect(band).connect(g).connect(ctx.destination);
    src.start(t + at, 0, 0.3);
  };
  if (kind === 'buy') {
    thud(0, 380, 0.35);
    tone(110, 0, 0.3, 'square', 0.04);
  } else if (kind === 'fuel') {
    [220, 190, 160].forEach((f, i) => tone(f, i * 0.12, 0.1, 'sine', 0.12));
  } else if (kind === 'refine') {
    tone(880, 0, 0.5, 'sine', 0.08);
    tone(1320, 0.04, 0.4, 'sine', 0.05);
  } else if (kind === 'upgrade') {
    tone(523, 0, 0.18, 'square', 0.04);
    tone(784, 0.16, 0.35, 'square', 0.04);
  } else if (kind === 'switch') {
    thud(0, 1800, 0.12);
  } else if (kind === 'scrap') {
    thud(0, 600, 0.3);
    thud(0.12, 300, 0.25);
  } else {
    tone(90, 0, 0.35, 'sawtooth', 0.05);
  }
}
