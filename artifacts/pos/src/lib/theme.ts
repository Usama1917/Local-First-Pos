// Light / dark appearance. The dark palette is already defined in index.css under
// `.dark` (Tailwind v4 `@custom-variant dark`), so toggling the `.dark` class on
// <html> switches the whole app. The choice is a per-device UI preference stored in
// localStorage (applied before React renders via an inline script in index.html to
// avoid a flash of the wrong theme).

export type Theme = "light" | "dark";

const KEY = "pos_theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable — still apply for this session */
  }
  applyTheme(theme);
}
