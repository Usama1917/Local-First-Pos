import { comboKeys } from "@/hooks/use-hotkeys";
import { cn } from "@/lib/utils";

// A slim, always-visible strip of keyboard-shortcut hints. Each hint shows its
// keycaps (⌘/Ctrl adapt to the platform) next to a short Arabic label, so the
// cashier can learn the shortcuts without a manual.

export interface HintItem {
  combo: string;
  label: string;
}

export function ShortcutHintBar({ items, className }: { items: HintItem[]; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
    >
      {items.map((it) => (
        <span key={it.combo} className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5">
            {comboKeys(it.combo).map((k, i) => (
              <kbd
                key={i}
                className="min-w-5 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-sans text-[0.7rem] font-semibold leading-none text-foreground shadow-sm"
              >
                {k}
              </kbd>
            ))}
          </span>
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  );
}
