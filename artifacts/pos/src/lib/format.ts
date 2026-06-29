export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "0 ج.م";
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return "0";
  return num.toLocaleString("en-US");
}

// Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits/separators to Western (0-9).
// Used so the whole app can accept Arabic numerals but always store/compute Western.
export function toWesternDigits(input: string): string {
  if (!input) return input;
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, ".")  // Arabic decimal separator ٫
    .replace(/٬/g, "");  // Arabic thousands separator ٬
}
