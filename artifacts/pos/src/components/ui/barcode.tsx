import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/** Renders a CODE128 barcode (bars + the value underneath) into an inline SVG. */
export function Barcode({
  value,
  height = 44,
  width = 1.6,
  fontSize = 13,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          width,
          height,
          displayValue: true,
          fontSize,
          textMargin: 2,
          margin: 0,
        });
      } catch {
        /* ignore invalid barcode values */
      }
    }
  }, [value, height, width, fontSize]);
  return <svg ref={ref} className={className} />;
}
