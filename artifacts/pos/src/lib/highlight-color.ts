// Selection-highlight color: the tint used to mark the active row/card while
// navigating search results with the keyboard (Arrow keys) or hovering with the
// mouse. Like the light/dark theme, this is a per-device UI preference stored in
// localStorage and applied by setting the `--nav-highlight` CSS variable on
// <html> (the `.nav-active` class in index.css reads it). Applied before React
// renders via an inline script in index.html to avoid a flash of the old color.
//
// Keep the HSL values here in sync with the inline map in index.html.

export interface HighlightColor {
  key: string;
  label: string;
  /** Space-separated HSL channels, e.g. "43 100% 50%" (used as `hsl(<hsl>)`). */
  hsl: string;
}

// Colors are light/saturated enough that the app's dark navy text stays readable
// on top of them (matching the original amber highlight).
export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { key: "amber", label: "برتقالي (افتراضي)", hsl: "43 100% 50%" },
  { key: "blue", label: "أزرق", hsl: "205 90% 68%" },
  { key: "green", label: "أخضر", hsl: "142 55% 60%" },
  { key: "rose", label: "وردي", hsl: "345 90% 72%" },
  { key: "purple", label: "بنفسجي", hsl: "265 75% 74%" },
  { key: "cyan", label: "سماوي", hsl: "190 85% 60%" },
];

const DEFAULT_KEY = "amber";
const KEY = "pos_highlight_color";

export function getHighlightColor(): string {
  try {
    const v = localStorage.getItem(KEY);
    return HIGHLIGHT_COLORS.some((c) => c.key === v) ? (v as string) : DEFAULT_KEY;
  } catch {
    return DEFAULT_KEY;
  }
}

export function applyHighlightColor(key: string): void {
  const c = HIGHLIGHT_COLORS.find((x) => x.key === key) ?? HIGHLIGHT_COLORS[0];
  document.documentElement.style.setProperty("--nav-highlight", c.hsl);
}

export function setHighlightColor(key: string): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* storage unavailable — still apply for this session */
  }
  applyHighlightColor(key);
}
