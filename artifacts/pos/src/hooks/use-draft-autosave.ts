import { useEffect, useRef } from "react";
import { useGetDraft, useSaveDraft, useDeleteDraft } from "@workspace/api-client-react";

/**
 * Periodically persists an in-progress form (cart, selections, …) to the server
 * `drafts` table (SQLite), and restores it when the form is reopened empty. This
 * means a power cut / refresh / crash in the middle of an invoice, quotation or
 * purchase does NOT lose the work — the cashier resumes where they stopped.
 *
 * The POS (sales) page already has its own inline draft logic; this hook brings
 * the same protection to the quotation / purchase dialogs.
 */
export function useDraftAutosave(opts: {
  type: string;            // e.g. "quotation" | "purchase"
  entityId: string;        // e.g. "new"
  enabled: boolean;        // typically: the dialog is open
  hasContent: boolean;     // whether there is anything worth saving (cart not empty)
  data: unknown;           // the snapshot to persist
  onRestore: (parsed: any) => void;
}) {
  const { type, entityId, enabled, hasContent, data, onRestore } = opts;
  const { data: existingDraft } = useGetDraft(type, entityId);
  const saveDraft = useSaveDraft();
  const deleteDraft = useDeleteDraft();
  const handled = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Restore once, when the form opens still empty and a saved draft exists.
  useEffect(() => {
    if (!enabled || handled.current || hasContent || !existingDraft) return;
    try {
      const parsed = JSON.parse((existingDraft as any).data);
      handled.current = true;
      onRestoreRef.current(parsed);
    } catch {
      /* ignore corrupt draft */
    }
  }, [enabled, existingDraft, hasContent]);

  // Debounced autosave whenever there is content.
  useEffect(() => {
    if (!enabled || !hasContent) return;
    const t = setTimeout(() => {
      saveDraft.mutate({ data: { type, entityId, data: JSON.stringify(data) } });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasContent, JSON.stringify(data)]);

  // Call after a successful save (or "start over") to drop the persisted draft.
  const clearDraft = () => {
    handled.current = true;
    deleteDraft.mutate({ type, entityId });
  };

  return { clearDraft };
}
