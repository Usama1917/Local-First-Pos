import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../../data");
const dbPath = path.resolve(dataDir, "store.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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
      quotationId INTEGER REFERENCES quotations(id),
      barcode TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sales_serial ON sales_invoices(serial);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales_invoices(customerId);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales_invoices(status);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales_invoices(createdAt);

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

    INSERT OR IGNORE INTO settings (id, shopName) VALUES (1, 'محل الأدوات الصحية والدهانات');

    INSERT OR IGNORE INTO users (username, password, name, role)
    VALUES ('admin', 'admin123', 'المدير', 'admin');
  `);
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

export function getSettings() {
  return db.prepare("SELECT * FROM settings WHERE id = 1").get() as any;
}

initializeSchema();

export default db;
