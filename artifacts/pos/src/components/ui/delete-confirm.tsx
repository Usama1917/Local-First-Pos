import { useState } from "react";
import { useGetDeletePreview, getGetDeletePreviewQueryKey } from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle, Ban, ListChecks, Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

type DeletableEntity =
  | "sales" | "purchases" | "returns" | "quotations"
  | "products" | "customers" | "craftsmen" | "suppliers"
  | "categories" | "brands" | "units";

interface DeleteButtonProps {
  entity: DeletableEntity;
  id: number;
  /** Document/record label shown in the dialog title, e.g. «فاتورة INV-2026-00012» */
  label: string;
  /** Executes the actual delete (the page's generated delete mutation + invalidations). */
  onDelete: () => Promise<void>;
  /** Compact icon-only trigger (default) or a small labelled button. */
  variant?: "icon" | "button";
  className?: string;
}

/**
 * Unified "delete with full disclosure" button. Opening it fetches the server's
 * delete-preview for the record and renders — verbatim — what will happen
 * (effects), what to watch out for (warnings) and why deletion may be refused
 * (blockers, which disable the confirm button). The server executes the exact
 * same logic on DELETE, so the dialog can't drift from reality.
 */
export function DeleteButton({ entity, id, label, onDelete, variant = "icon", className }: DeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useGetDeletePreview(entity, id, {
    query: { queryKey: getGetDeletePreviewQueryKey(entity, id), enabled: open, staleTime: 0, gcTime: 0 },
  });
  const preview = data as any;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onDelete();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.data?.error || e?.message || "تعذّر الحذف");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <Button
          size="icon"
          variant="ghost"
          className={`h-8 w-8 text-destructive ${className || ""}`}
          title="حذف"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className={`text-destructive ${className || ""}`} onClick={() => setOpen(true)}>
          <Trash2 className="h-3.5 w-3.5 ml-1" /> حذف
        </Button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              تأكيد حذف {label}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-start">
                {isLoading && (
                  <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> جاري فحص تأثير الحذف...
                  </div>
                )}
                {!!error && <p className="text-destructive py-4">تعذّر فحص تأثير الحذف — أعد المحاولة</p>}

                {preview && (
                  <>
                    {preview.blockers?.length > 0 && (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
                        <p className="flex items-center gap-1.5 font-semibold text-destructive">
                          <Ban className="h-4 w-4" /> لا يمكن الحذف
                        </p>
                        {preview.blockers.map((b: string, i: number) => (
                          <p key={i} className="text-sm text-destructive/90 leading-relaxed">• {b}</p>
                        ))}
                      </div>
                    )}

                    {preview.canDelete && preview.effects?.length > 0 && (
                      <div className="rounded-md border p-3 space-y-1.5">
                        <p className="flex items-center gap-1.5 font-semibold text-foreground">
                          {preview.mode === "archive"
                            ? <><Archive className="h-4 w-4 text-blue-600" /> ماذا سيحدث (أرشفة وليست حذفاً نهائياً)</>
                            : <><ListChecks className="h-4 w-4 text-blue-600" /> ماذا سيحدث بالضبط</>}
                        </p>
                        {preview.effects.map((e: string, i: number) => (
                          <p key={i} className="text-sm text-foreground/80 leading-relaxed">• {e}</p>
                        ))}
                      </div>
                    )}

                    {preview.canDelete && preview.warnings?.length > 0 && (
                      <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1.5">
                        <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-4 w-4" /> انتبه
                        </p>
                        {preview.warnings.map((w: string, i: number) => (
                          <p key={i} className="text-sm text-amber-800/90 dark:text-amber-200/90 leading-relaxed">• {w}</p>
                        ))}
                      </div>
                    )}

                    {preview.canDelete && (
                      <p className="text-xs text-muted-foreground">
                        {preview.mode === "archive"
                          ? "الأرشفة قابلة للتراجع — يمكن إعادة التفعيل لاحقاً."
                          : "هذا الإجراء نهائي ولا يمكن التراجع عنه."}
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              رجوع
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={busy || isLoading || !preview?.canDelete}
            >
              {busy && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {preview?.mode === "archive" ? "موافق — أرشفة" : "موافق — حذف"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
