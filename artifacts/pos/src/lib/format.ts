export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "0 ج.م";
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return "0";
  return num.toLocaleString("en-US");
}
