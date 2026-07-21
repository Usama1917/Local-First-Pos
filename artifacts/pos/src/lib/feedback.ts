// Audible + haptic feedback for cashier actions. Sounds are SYNTHESISED with the
// Web Audio API (no audio files) so they add nothing to the bundle and work fully
// offline on the shop PC. A cashier relies on a confirming "blip" per scan/add and
// a distinct error tone — far faster than reading the screen in a busy shop.
//
// Enable/disable is a per-device UI preference in localStorage (default ON),
// mirroring lib/theme.ts / lib/highlight-color.ts. Matches [[shop-pc-deployment]].

const KEY = "pos_sound";

export function getSoundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0"; // default ON
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable — still applies for this session via the play guard */
  }
  if (on) beep("add"); // instant confirmation that sound is now on
}

// One shared AudioContext, created lazily on the first sound. Browsers start it
// "suspended" until a user gesture; every cashier action IS a gesture, so we just
// resume() on demand. `webkitAudioContext` covers older engines.
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Play one tone. `t0` is an offset (s) from "now" so tones can be sequenced. */
function tone(
  ac: AudioContext,
  freq: number,
  durMs: number,
  { type = "sine", gain = 0.05, t0 = 0 }: { type?: OscillatorType; gain?: number; t0?: number } = {},
): void {
  const start = ac.currentTime + t0;
  const dur = durMs / 1000;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Short attack + exponential release so it reads as a crisp "blip", not a click.
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export type FeedbackKind = "add" | "success" | "error" | "warn";

// Vibration patterns (ms). No-op on desktop (navigator.vibrate absent) — only
// fires on a touchscreen shop tablet.
const HAPTIC: Record<FeedbackKind, number | number[]> = {
  add: 15,
  success: [15, 40, 15],
  error: [60, 40, 60],
  warn: 30,
};

/** Play a feedback cue for an action. Silent when the user turned sound off. */
export function beep(kind: FeedbackKind): void {
  if (!getSoundEnabled()) return;

  try {
    navigator.vibrate?.(HAPTIC[kind]);
  } catch {
    /* ignore */
  }

  const ac = audio();
  if (!ac) return;

  switch (kind) {
    case "add": // single crisp blip — item added / scanned
      tone(ac, 880, 70, { type: "sine", gain: 0.05 });
      break;
    case "success": // rising two-note chime — sale finalised
      tone(ac, 660, 90, { type: "sine", gain: 0.05, t0: 0 });
      tone(ac, 990, 130, { type: "sine", gain: 0.05, t0: 0.1 });
      break;
    case "error": // low descending buzz — not found / failed
      tone(ac, 320, 140, { type: "square", gain: 0.04, t0: 0 });
      tone(ac, 200, 180, { type: "square", gain: 0.04, t0: 0.12 });
      break;
    case "warn": // single mid tone — below-min price / caution
      tone(ac, 520, 120, { type: "triangle", gain: 0.045 });
      break;
  }
}
