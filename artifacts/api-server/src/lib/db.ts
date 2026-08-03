import { DatabaseSync } from "node:sqlite";
import { dbPath } from "./paths.js";

export const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

export function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      permissions TEXT,                              -- JSON array of allowed page keys (non-admin)
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shopName TEXT NOT NULL DEFAULT 'المحل',
      shopPhone TEXT,
      shopAddress TEXT,
      currency TEXT NOT NULL DEFAULT 'EGP',
      defaultPrintTemplate TEXT NOT NULL DEFAULT 'a4',
      lowStockThreshold INTEGER NOT NULL DEFAULT 5,
      enableCraftsmanCommission INTEGER NOT NULL DEFAULT 1,
      enableDarkMode INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'ar',
      invoicePrefix TEXT NOT NULL DEFAULT 'INV',
      quotationPrefix TEXT NOT NULL DEFAULT 'QUO',
      purchasePrefix TEXT NOT NULL DEFAULT 'PUR',
      invoiceCounter INTEGER NOT NULL DEFAULT 0,
      quotationCounter INTEGER NOT NULL DEFAULT 0,
      purchaseCounter INTEGER NOT NULL DEFAULT 0,
      invoiceTerms TEXT,                             -- shop's sale terms, one per line; printed on invoices above the signatures
      lastBackupAt TEXT,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nameEn TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nameEn TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nameEn TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      contactPerson TEXT,
      notes TEXT,
      openingBalance REAL NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nameAr TEXT NOT NULL,
      nameEn TEXT,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT UNIQUE,
      categoryId INTEGER REFERENCES categories(id),
      brandId INTEGER REFERENCES brands(id),
      supplierId INTEGER REFERENCES suppliers(id),
      unitId INTEGER REFERENCES units(id),
      listPrice REAL NOT NULL DEFAULT 0,
      supplierDiscount REAL NOT NULL DEFAULT 0,
      netPurchasePrice REAL NOT NULL DEFAULT 0,
      extraCost REAL NOT NULL DEFAULT 0,
      trueCost REAL NOT NULL DEFAULT 0,
      sellingPrice REAL NOT NULL DEFAULT 0,
      minSellingPrice REAL,
      currentStock REAL NOT NULL DEFAULT 0,
      minStock REAL NOT NULL DEFAULT 5,
      location TEXT,
      notes TEXT,
      colorCode TEXT,
      paintType TEXT,
      packageSize TEXT,
      soldByWeight INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(categoryId);

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      phone2 TEXT,
      address TEXT,
      area TEXT,
      notes TEXT,
      openingBalance REAL NOT NULL DEFAULT 0,
      creditLimit REAL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

    CREATE TABLE IF NOT EXISTS craftsmen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      jobType TEXT,
      address TEXT,
      notes TEXT,
      commissionPercent REAL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      customerId INTEGER REFERENCES customers(id),
      craftsmanId INTEGER REFERENCES craftsmen(id),
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      validUntil TEXT,
      convertedInvoiceId INTEGER,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotationId INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 1,
      unitPrice REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      paymentType TEXT NOT NULL DEFAULT 'cash',
      customerId INTEGER REFERENCES customers(id),
      craftsmanId INTEGER REFERENCES craftsmen(id),
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paidAmount REAL NOT NULL DEFAULT 0,
      remainingAmount REAL NOT NULL DEFAULT 0,
      craftsmanCommission REAL NOT NULL DEFAULT 0,
      commissionPaid REAL NOT NULL DEFAULT 0,
      quotationId INTEGER REFERENCES quotations(id),
      -- Amendment chain: a corrected invoice points back at the one it replaced
      -- (amendedFromId), and the superseded one points forward (amendedToId) and
      -- moves to status 'amended' — kept for the record, out of every ledger.
      amendedFromId INTEGER REFERENCES sales_invoices(id),
      amendedToId INTEGER REFERENCES sales_invoices(id),
      barcode TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sales_serial ON sales_invoices(serial);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales_invoices(customerId);
    CREATE INDEX IF NOT EXISTS idx_sales_craftsman ON sales_invoices(craftsmanId);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales_invoices(status);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales_invoices(createdAt);

    CREATE INDEX IF NOT EXISTS idx_quotations_serial ON quotations(serial);
    CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customerId);
    CREATE INDEX IF NOT EXISTS idx_quotations_craftsman ON quotations(craftsmanId);

    CREATE TABLE IF NOT EXISTS sales_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 1,
      unitPrice REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      paymentType TEXT NOT NULL DEFAULT 'cash',
      supplierId INTEGER REFERENCES suppliers(id),
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paidAmount REAL NOT NULL DEFAULT 0,
      remainingAmount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      invoiceDate TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchaseId INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 1,
      listPrice REAL NOT NULL DEFAULT 0,
      supplierDiscount REAL NOT NULL DEFAULT 0,
      netPrice REAL NOT NULL DEFAULT 0,
      extraCost REAL NOT NULL DEFAULT 0,
      trueCost REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id),
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      balanceBefore REAL NOT NULL DEFAULT 0,
      balanceAfter REAL NOT NULL DEFAULT 0,
      referenceType TEXT,
      referenceId INTEGER,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(productId);
    CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(type);

    CREATE TABLE IF NOT EXISTS stock_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      finalizedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_count_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stockCountId INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id),
      systemQty REAL NOT NULL DEFAULT 0,
      countedQty REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL REFERENCES customers(id),
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER NOT NULL REFERENCES suppliers(id),
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entityId TEXT NOT NULL,
      data TEXT NOT NULL,
      savedBy TEXT,
      savedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(type, entityId)
    );

    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    -- Server-side login sessions. A random opaque token is issued at login and
    -- verified by the auth middleware on every /api request. Persisted (not just
    -- in-memory) so tokens survive an API restart — the shop's dev script is
    -- build && start, so the process restarts on every deploy.
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

    CREATE TABLE IF NOT EXISTS craftsman_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial TEXT NOT NULL UNIQUE,
      craftsmanId INTEGER NOT NULL REFERENCES craftsmen(id),
      amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payouts_craftsman ON craftsman_payouts(craftsmanId);

    CREATE TABLE IF NOT EXISTS craftsman_payout_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payoutId INTEGER NOT NULL REFERENCES craftsman_payouts(id) ON DELETE CASCADE,
      invoiceId INTEGER NOT NULL REFERENCES sales_invoices(id),
      amount REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_payout_items_payout ON craftsman_payout_items(payoutId);

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial TEXT NOT NULL UNIQUE,
      originalInvoiceId INTEGER REFERENCES sales_invoices(id),
      originalSerial TEXT,
      customerId INTEGER REFERENCES customers(id),
      type TEXT NOT NULL DEFAULT 'return',          -- 'return' | 'exchange'
      settlementType TEXT NOT NULL DEFAULT 'cash',  -- 'cash' | 'account'
      returnedTotal REAL NOT NULL DEFAULT 0,
      newItemsTotal REAL NOT NULL DEFAULT 0,
      netAmount REAL NOT NULL DEFAULT 0,            -- newItemsTotal − returnedTotal (>0 customer pays, <0 refund)
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns(originalInvoiceId);
    CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customerId);

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      returnId INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'returned',        -- 'returned' | 'new'
      productId INTEGER NOT NULL REFERENCES products(id),
      productName TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unitPrice REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      restock INTEGER NOT NULL DEFAULT 1            -- returned items only: 1 back to stock, 0 damaged
    );
    CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(returnId);

    INSERT OR IGNORE INTO settings (id, shopName) VALUES (1, 'محل الأدوات الصحية والدهانات');

    INSERT OR IGNORE INTO users (username, password, name, role)
    VALUES ('admin', 'admin123', 'المدير', 'admin');
  `);

  // Migrations for columns added after the first release (CREATE TABLE IF NOT
  // EXISTS won't add a column to a pre-existing table).
  ensureColumn("products", "soldByWeight", "INTEGER NOT NULL DEFAULT 0");
  // Running total of commission already paid out to the craftsman for this invoice.
  ensureColumn("sales_invoices", "commissionPaid", "REAL NOT NULL DEFAULT 0");
  // Per-user allowed page keys (JSON array). NULL for admins (full access).
  ensureColumn("users", "permissions", "TEXT");
  // Shop's custom sale terms (one per line) printed on invoices above the signatures.
  ensureColumn("settings", "invoiceTerms", "TEXT");
  // Invoice amendment chain (see the CREATE TABLE comment above).
  ensureColumn("sales_invoices", "amendedFromId", "INTEGER");
  ensureColumn("sales_invoices", "amendedToId", "INTEGER");

  // Audit trail: who created / last modified each transactional record. `createdBy`
  // exists in the CREATE TABLE definitions but pre-existing installs need the ALTER;
  // `updatedBy` is new for the editable documents. (`createdAt`/`updatedAt` already exist.)
  for (const t of [
    "quotations", "sales_invoices", "purchase_invoices", "returns",
    "customer_payments", "supplier_payments", "craftsman_payouts",
    "stock_movements", "stock_counts",
  ]) {
    ensureColumn(t, "createdBy", "TEXT");
  }
  for (const t of ["quotations", "sales_invoices", "purchase_invoices"]) {
    ensureColumn(t, "updatedBy", "TEXT");
  }
}

// Adds a column to an existing table if it isn't there yet (idempotent).
function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function nextSerial(prefix: string): string {
  const year = new Date().getFullYear();
  const s = db.prepare("SELECT * FROM settings WHERE id = 1").get() as any;
  let counter = 0;
  if (prefix === (s?.invoicePrefix || "INV")) {
    counter = (s?.invoiceCounter || 0) + 1;
    db.prepare("UPDATE settings SET invoiceCounter = ?, updatedAt = datetime('now') WHERE id = 1").run(counter);
  } else if (prefix === (s?.quotationPrefix || "QUO")) {
    counter = (s?.quotationCounter || 0) + 1;
    db.prepare("UPDATE settings SET quotationCounter = ?, updatedAt = datetime('now') WHERE id = 1").run(counter);
  } else if (prefix === (s?.purchasePrefix || "PUR")) {
    counter = (s?.purchaseCounter || 0) + 1;
    db.prepare("UPDATE settings SET purchaseCounter = ?, updatedAt = datetime('now') WHERE id = 1").run(counter);
  }
  return `${prefix}-${year}-${String(counter).padStart(6, "0")}`;
}

/**
 * Generates a store-internal barcode for products that arrive without one.
 * Uses an incrementing `barcode` counter, prefixed with "2" (the EAN range
 * reserved for in-store use), and skips any value already taken so the result
 * is guaranteed unique in the products table.
 */
// Serial backed by a named row in the `counters` table, for document types that
// nextSerial() doesn't know about (it only handles invoice/quote/purchase).
function nextCounterSerial(counterName: string, prefix: string): string {
  const year = new Date().getFullYear();
  const row = db.prepare("SELECT value FROM counters WHERE name = ?").get(counterName) as any;
  const counter = (row?.value ?? 0) + 1;
  db.prepare(
    "INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
  ).run(counterName, counter);
  return `${prefix}-${year}-${String(counter).padStart(6, "0")}`;
}

// Serial for a craftsman commission payout (CMP-YYYY-000001).
export function nextPayoutSerial(): string {
  return nextCounterSerial("commission_payout", "CMP");
}

// Serial for a return / exchange document (RET-YYYY-000001).
export function nextReturnSerial(): string {
  return nextCounterSerial("return", "RET");
}

export function nextBarcode(): string {
  const row = db.prepare("SELECT value FROM counters WHERE name = 'barcode'").get() as any;
  let counter = row?.value ?? 0;
  let candidate = "";
  do {
    counter += 1;
    candidate = "2" + String(counter).padStart(6, "0");
  } while (db.prepare("SELECT 1 FROM products WHERE barcode = ?").get(candidate));
  db.prepare(
    "INSERT INTO counters (name, value) VALUES ('barcode', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
  ).run(counter);
  return candidate;
}

export function getSettings() {
  return db.prepare("SELECT * FROM settings WHERE id = 1").get() as any;
}

initializeSchema();

export default db;
