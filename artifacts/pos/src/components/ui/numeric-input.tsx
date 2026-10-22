import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Numeric input that tolerates partial entry while typing ("-", "5.", "-3.")
 * — a plain controlled input would re-render a lone "-" away because it parses
 * to NaN→0. Local text state holds what's typed; the parsed number is pushed up
 * on every valid change, and the text re-syncs from the prop when not focused.
 */
export function NumericInput({ value, onValue, ...props }: { value: number; onValue: (n: number) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const fmt = (n: number) => (n ? String(Math.round(n * 100) / 100) : "");
  const [text, setText] = useState(() => fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    // Re-sync when not focused; while focused, only re-sync if the parent clamped
    // a COMPLETE number we'd typed (leave partial entries like "5." or "-" alone).
    if (!focused.current) { setText(fmt(value)); return; }
    if (/^-?\d+(\.\d+)?$/.test(text) && parseFloat(text) !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      type="number"
      // Signed discounts need a minus key, which many phone decimal keyboards omit.
      inputMode="text"
      {...props}
      value={text}
      onFocus={(e) => { focused.current = true; props.onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; setText(fmt(value)); props.onBlur?.(e); }}
      onChange={(e) => {
        const t = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(t)) return; // digits, one optional leading minus & decimal point
        setText(t);
        const n = parseFloat(t);
        onValue(Number.isNaN(n) ? 0 : n);
      }}
    />
  );
}
