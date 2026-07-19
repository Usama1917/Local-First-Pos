import { Router } from "express";
import { previewDelete } from "../lib/deletion.js";

const router = Router();

// What exactly would happen if this record were deleted (effects / warnings /
// blockers, in Arabic) — the frontend confirmation dialog renders this verbatim,
// and the DELETE handlers execute the very same logic.
router.get("/delete-preview/:entity/:id", (req, res) => {
  const preview = previewDelete(req.params.entity, Number(req.params.id));
  if (preview === undefined) return res.status(400).json({ error: "كيان غير معروف" });
  if (preview === null) return res.status(404).json({ error: "غير موجود" });
  res.json(preview);
});

export default router;
