import { useEffect, useRef } from "react";

// Cross-platform keyboard shortcuts. "mod" means ⌘ on macOS and Ctrl on Windows
// (the shop PC), so a binding like `mod+enter` works on both without change.
// Combos are matched against a normalised string built from the event.

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");

export interface Hotkey {
  /** e.g. "mod+k", "f2", "mod+enter", "mod+backspace", "/". Lower-case. */
  combo: string;
  run: (e: KeyboardEvent) => void;
  /** Fire even while a text field/select is focused (for modifier/F-key combos). */
  allowInInput?: boolean;
  /** Short Arabic label for the on-screen hint bar. */
  label?: string;
}

function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod"); // ⌘ (mac) or Ctrl (win) — same intent
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  let k = e.key.toLowerCase();
  if (k === " ") k = "space";
  parts.push(k);
  return parts.join("+");
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Bind a list of hotkeys to `window`. The list may be rebuilt every render (fresh
 * closures over current state) — we read it through a ref so the listener is
 * attached only once and never goes stale.
 */
export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  const ref = useRef(hotkeys);
  ref.current = hotkeys;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const combo = eventCombo(e);
      for (const h of ref.current) {
        if (h.combo !== combo) continue;
        if (!h.allowInInput && isEditable(e.target)) continue;
        e.preventDefault();
        h.run(e);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}

// Turn a combo into printable keycaps for the hint bar, adapting to the platform:
// "mod+enter" → ["⌘","↵"] on mac / ["Ctrl","↵"] on Windows.
const KEYCAP: Record<string, string> = {
  mod: isMac ? "⌘" : "Ctrl",
  enter: "↵",
  backspace: "⌫",
  escape: "Esc",
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
};

export function comboKeys(combo: string): string[] {
  return combo.split("+").map((p) => KEYCAP[p] ?? (p.length === 1 ? p.toUpperCase() : p.toUpperCase()));
}
