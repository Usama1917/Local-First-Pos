import { useEffect, useRef } from "react";
import { searchProducts } from "@workspace/api-client-react";

/**
 * Detects input from a hardware (laser) barcode scanner anywhere on the page.
 *
 * A scanner behaves like a keyboard that types a code very fast and ends with
 * Enter. We capture that rapid burst regardless of which element is focused, so
 * the cashier never has to click into a field first. Slow human typing never
 * triggers it (the buffer resets whenever the gap between keys is too large).
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  options?: { enabled?: boolean; minLength?: number; maxGapMs?: number },
) {
  const enabled = options?.enabled ?? true;
  const minLength = options?.minLength ?? 3;
  const maxGapMs = options?.maxGapMs ?? 50;

  const buffer = useRef("");
  const lastTime = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const now = performance.now();
      if (now - lastTime.current > maxGapMs) buffer.current = "";
      lastTime.current = now;

      if (e.key === "Enter") {
        const code = buffer.current.trim();
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }
      // Accumulate printable single characters only (ignore Shift, Arrows, ...).
      if (e.key.length === 1) buffer.current += e.key;
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, minLength, maxGapMs]);
}

/**
 * Looks up a product by a scanned code. The backend matches the barcode exactly,
 * so we prefer an exact barcode/SKU match and fall back to the first result.
 * Returns null when nothing matches.
 */
export async function findProductByCode(code: string): Promise<any | null> {
  try {
    const results = await searchProducts({ q: code });
    if (!results?.length) return null;
    return results.find((r: any) => r.barcode === code || r.sku === code) ?? results[0];
  } catch {
    return null;
  }
}
