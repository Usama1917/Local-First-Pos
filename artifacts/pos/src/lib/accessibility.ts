// Eye-comfort / accessibility preferences: text size, high-contrast mode, and a
// one-tap fullscreen (kiosk) toggle. Text size + contrast are per-device UI
// preferences in localStorage — like lib/theme.ts — and are applied BEFORE React
// renders by the inline script in index.html to avoid a flash.
//
// Text size works by scaling the root font-size: the whole UI is built in rem/em
// (Tailwind), so everything (text, spacing, controls) scales together and stays
// proportional. High contrast toggles the `.hc` class on <html>; the overrides
// live in index.css. Keep the FONT_SCALES map here in sync with index.html.

export type FontScale = "normal" | "large" | "xlarge";

const FONT_KEY = "pos_font_scale";
const CONTRAST_KEY = "pos_contrast";

// root font-size per level (browser default = 16px = 100%).
export const FONT_SCALES: Record<FontScale, string> = {
  normal: "100%",
  large: "112.5%", // ~18px
  xlarge: "125%", //  ~20px
};

export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  normal: "عادي",
  large: "كبير",
  xlarge: "أكبر",
};

export function getFontScale(): FontScale {
  try {
    const v = localStorage.getItem(FONT_KEY);
    return v === "large" || v === "xlarge" ? v : "normal";
  } catch {
    return "normal";
  }
}

export function applyFontScale(scale: FontScale): void {
  document.documentElement.style.fontSize = FONT_SCALES[scale];
}

export function setFontScale(scale: FontScale): void {
  try {
    localStorage.setItem(FONT_KEY, scale);
  } catch {
    /* storage unavailable — still apply for this session */
  }
  applyFontScale(scale);
}

export function getContrast(): boolean {
  try {
    return localStorage.getItem(CONTRAST_KEY) === "1";
  } catch {
    return false;
  }
}

export function applyContrast(on: boolean): void {
  document.documentElement.classList.toggle("hc", on);
}

export function setContrast(on: boolean): void {
  try {
    localStorage.setItem(CONTRAST_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable — still apply for this session */
  }
  applyContrast(on);
}

// ── Fullscreen (kiosk) ─────────────────────────────────────────────────────
// An action, not a stored preference. Vendor fallbacks cover older WebKit.

export function isFullscreen(): boolean {
  return !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
}

export function toggleFullscreen(): void {
  try {
    if (isFullscreen()) {
      (document.exitFullscreen || (document as any).webkitExitFullscreen)?.call(document);
    } else {
      const el = document.documentElement as any;
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    }
  } catch {
    /* fullscreen may be blocked (e.g. not from a user gesture) — ignore */
  }
}
