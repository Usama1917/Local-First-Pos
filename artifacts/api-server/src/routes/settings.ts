import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/settings", (_req, res) => {
  res.json(db.prepare("SELECT * FROM settings WHERE id = 1").get());
});

router.patch("/settings", (req, res) => {
  const {
    shopName, shopPhone, shopAddress, currency, defaultPrintTemplate,
    lowStockThreshold, enableCraftsmanCommission, enableDarkMode,
    language, invoicePrefix, quotationPrefix, purchasePrefix,
  } = req.body;

  db.prepare(`
    UPDATE settings SET
    shopName = COALESCE(?, shopName),
    shopPhone = COALESCE(?, shopPhone),
    shopAddress = COALESCE(?, shopAddress),
    currency = COALESCE(?, currency),
    defaultPrintTemplate = COALESCE(?, defaultPrintTemplate),
    lowStockThreshold = COALESCE(?, lowStockThreshold),
    enableCraftsmanCommission = COALESCE(?, enableCraftsmanCommission),
    enableDarkMode = COALESCE(?, enableDarkMode),
    language = COALESCE(?, language),
    invoicePrefix = COALESCE(?, invoicePrefix),
    quotationPrefix = COALESCE(?, quotationPrefix),
    purchasePrefix = COALESCE(?, purchasePrefix),
    updatedAt = datetime('now')
    WHERE id = 1
  `).run(
    shopName || null, shopPhone || null, shopAddress || null, currency || null,
    defaultPrintTemplate || null, lowStockThreshold ?? null,
    enableCraftsmanCommission !== undefined ? (enableCraftsmanCommission ? 1 : 0) : null,
    enableDarkMode !== undefined ? (enableDarkMode ? 1 : 0) : null,
    language || null, invoicePrefix || null, quotationPrefix || null, purchasePrefix || null,
  );

  res.json(db.prepare("SELECT * FROM settings WHERE id = 1").get());
});

export default router;
