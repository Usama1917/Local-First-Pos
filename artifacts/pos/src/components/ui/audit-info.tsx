import { Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

/** SQLite stores `datetime('now')` as "YYYY-MM-DD HH:MM:SS" in UTC. Parse it as UTC
 *  and show it in local (Egyptian) time. ISO strings (with a T) pass through. */
function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return v;
  try {
    return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d.toLocaleString();
  }
}

export interface AuditInfoProps {
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  /** Serial of the document this one replaced (an amended invoice) — when set, the
   *  popover also credits whoever made that original, so both hands are visible. */
  originSerial?: string | null;
  originBy?: string | null;
  originAt?: string | null;
}

/**
 * A small "i" button that reveals who created (and, if different, who last modified)
 * a record and when. Used next to transactional rows (invoices, returns, purchases,
 * quotations, payments, payouts …). Renders nothing if there's no audit data.
 *
 * For an invoice that superseded an earlier one, the record was authored by the
 * person who made the EDIT, so the first block is relabelled and the original
 * invoice's author is shown underneath it.
 */
export function AuditInfo({ createdBy, createdAt, updatedBy, updatedAt, originSerial, originBy, originAt }: AuditInfoProps) {
  if (!createdBy && !createdAt && !updatedBy && !updatedAt) return null;
  const isAmendment = !!originSerial;

  // Only show the "last modified" block when it's a real, later edit by/at a
  // different user/time than the creation.
  const wasEdited = !!updatedAt && (updatedAt !== createdAt || (!!updatedBy && updatedBy !== createdBy));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="مين عمل الحركة دي وإمتى"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">{isAmendment ? "عمل التعديل" : "أنشأها"}</p>
          <p className="font-semibold">{createdBy || "غير معروف"}</p>
          <p className="text-xs text-muted-foreground">{fmtDateTime(createdAt)}</p>
        </div>
        {isAmendment && (
          <div className="space-y-0.5 border-t pt-2">
            <p className="text-xs text-muted-foreground">
              الفاتورة الأصلية <span className="font-mono">{originSerial}</span> — أنشأها
            </p>
            <p className="font-semibold">{originBy || "غير معروف"}</p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(originAt)}</p>
          </div>
        )}
        {wasEdited && (
          <div className="space-y-0.5 border-t pt-2">
            <p className="text-xs text-muted-foreground">آخر تعديل</p>
            <p className="font-semibold">{updatedBy || "غير معروف"}</p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(updatedAt)}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
