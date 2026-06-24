import db from "./db.js";

export function seedDatabase() {
  const existingCategories = db.prepare("SELECT COUNT(*) as count FROM categories").get() as any;
  if (existingCategories.count > 0) return;

  db.exec(`
    INSERT INTO categories (name, nameEn) VALUES
      ('دهانات', 'Paints'),
      ('أدوات صحية', 'Sanitary Ware'),
      ('مواسير', 'Pipes'),
      ('خلاطات', 'Mixers'),
      ('محابس', 'Valves'),
      ('لوازم سباكة', 'Plumbing Supplies'),
      ('إكسسوارات حمام', 'Bathroom Accessories'),
      ('عدد ومعدات', 'Tools & Equipment');

    INSERT INTO brands (name, nameEn) VALUES
      ('جوتن', 'Jotun'),
      ('بيفاني', 'Bvlgari'),
      ('هانكوك', 'Hanco'),
      ('فيكتاوليك', 'Victaulic'),
      ('روساتي', 'Rosati'),
      ('مصر للدهانات', 'Egypt Paints');

    INSERT INTO units (name, nameEn) VALUES
      ('قطعة', 'Piece'),
      ('كرتونة', 'Carton'),
      ('علبة', 'Can'),
      ('متر', 'Meter'),
      ('كيلو', 'Kilo'),
      ('لتر', 'Liter'),
      ('جالون', 'Gallon'),
      ('جردل', 'Bucket'),
      ('عبوة', 'Package'),
      ('ماسورة', 'Pipe'),
      ('لفة', 'Roll');

    INSERT INTO suppliers (name, phone, address, contactPerson, openingBalance) VALUES
      ('مستودع الدهانات المركزي', '01001234567', 'القاهرة، شارع الجيش', 'أحمد محمد', 5000),
      ('شركة الأدوات الصحية المتحدة', '01112345678', 'الإسكندرية، ميناء', 'محمد علي', 12000),
      ('مخازن مواسير الدلتا', '01223456789', 'الدلتا، المنصورة', 'علي حسين', 3500);

    INSERT INTO customers (name, phone, address, area, openingBalance) VALUES
      ('أحمد محمد السيد', '01001111111', 'شارع النيل، الطابق الثاني', 'المعادي', 0),
      ('محمد علي حسن', '01112222222', 'حي الزيتون', 'الزيتون', 1500),
      ('شركة المقاولات الحديثة', '01223333333', 'المنطقة الصناعية', 'المحلة', 8000);

    INSERT INTO craftsmen (name, phone, jobType, address, commissionPercent) VALUES
      ('حسن السباك', '01334444444', 'سباك', 'حي الشعب', 5),
      ('علي النقاش', '01445555555', 'نقاش', 'شارع الملك', 3),
      ('مصطفى الفني', '01556666666', 'فني تركيبات', 'المدينة القديمة', 4);
  `);

  const supplierId = (db.prepare("SELECT id FROM suppliers WHERE name = 'مستودع الدهانات المركزي'").get() as any)?.id;
  const supplierId2 = (db.prepare("SELECT id FROM suppliers WHERE name = 'شركة الأدوات الصحية المتحدة'").get() as any)?.id;
  const supplierId3 = (db.prepare("SELECT id FROM suppliers WHERE name = 'مخازن مواسير الدلتا'").get() as any)?.id;
  const catDahana = (db.prepare("SELECT id FROM categories WHERE name = 'دهانات'").get() as any)?.id;
  const catSanitary = (db.prepare("SELECT id FROM categories WHERE name = 'أدوات صحية'").get() as any)?.id;
  const catPipes = (db.prepare("SELECT id FROM categories WHERE name = 'مواسير'").get() as any)?.id;
  const catMixers = (db.prepare("SELECT id FROM categories WHERE name = 'خلاطات'").get() as any)?.id;
  const catValves = (db.prepare("SELECT id FROM categories WHERE name = 'محابس'").get() as any)?.id;
  const catPlumbing = (db.prepare("SELECT id FROM categories WHERE name = 'لوازم سباكة'").get() as any)?.id;
  const brandJotun = (db.prepare("SELECT id FROM brands WHERE name = 'جوتن'").get() as any)?.id;
  const brandEgypt = (db.prepare("SELECT id FROM brands WHERE name = 'مصر للدهانات'").get() as any)?.id;
  const brandHanco = (db.prepare("SELECT id FROM brands WHERE name = 'هانكوك'").get() as any)?.id;
  const unitPiece = (db.prepare("SELECT id FROM units WHERE name = 'قطعة'").get() as any)?.id;
  const unitCan = (db.prepare("SELECT id FROM units WHERE name = 'علبة'").get() as any)?.id;
  const unitGallon = (db.prepare("SELECT id FROM units WHERE name = 'جالون'").get() as any)?.id;
  const unitBucket = (db.prepare("SELECT id FROM units WHERE name = 'جردل'").get() as any)?.id;
  const unitMeter = (db.prepare("SELECT id FROM units WHERE name = 'متر'").get() as any)?.id;

  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products 
    (nameAr, nameEn, sku, barcode, categoryId, brandId, supplierId, unitId, listPrice, supplierDiscount, netPurchasePrice, extraCost, trueCost, sellingPrice, minSellingPrice, currentStock, minStock, colorCode, paintType, packageSize)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const products = [
    ["دهان جوتن أبيض 1 جالون", "Jotun White Paint 1 Gallon", "JOT-WHT-1G", "6001234567890", catDahana, brandJotun, supplierId, unitGallon, 280, 30, 196, 10, 206, 280, 220, 25, 5, "أبيض", "بلاستيك داخلي", "1 جالون"],
    ["دهان جوتن أبيض 4 جالون", "Jotun White Paint 4 Gallon", "JOT-WHT-4G", "6001234567891", catDahana, brandJotun, supplierId, unitBucket, 980, 30, 686, 30, 716, 980, 800, 15, 3, "أبيض", "بلاستيك داخلي", "4 جالون"],
    ["دهان أكريليك مصري 1 جالون", "Egyptian Acrylic 1 Gallon", "EGY-ACR-1G", "6009876543210", catDahana, brandEgypt, supplierId, unitGallon, 150, 25, 112.5, 5, 117.5, 160, 130, 30, 3, "أبيض عاجي", "أكريليك خارجي", "1 جالون"],
    ["مغسلة بيضاء رجل 60 سم", "White Basin 60cm", "SAN-BAS-60", "6007654321098", catSanitary, null, supplierId2, unitPiece, 350, 20, 280, 20, 300, 400, 320, 8, 2, null, null, null],
    ["سيفون أرضية PVC 10 سم", "PVC Floor Drain 10cm", "DRN-FLR-10", "6006543210987", catSanitary, null, supplierId2, unitPiece, 45, 15, 38.25, 2, 40.25, 60, 48, 50, 10, null, null, null],
    ["ماسورة PVC 4 بوصة 6 متر", "PVC Pipe 4inch 6m", "PPE-PVC-4X6", "6005432109876", catPipes, brandHanco, supplierId3, unitMeter, 85, 20, 68, 5, 73, 95, 78, 120, 20, null, null, "6 متر"],
    ["ماسورة PPR 20 مللي", "PPR Pipe 20mm", "PPE-PPR-20", "6004321098765", catPipes, brandHanco, supplierId3, unitMeter, 22, 15, 18.7, 1, 19.7, 28, 22, 200, 30, null, null, "بالمتر"],
    ["خلاط حمام كروم", "Chrome Bath Mixer", "MXR-BTH-CHR", "6003210987654", catMixers, null, supplierId2, unitPiece, 520, 25, 390, 20, 410, 580, 480, 12, 3, null, null, null],
    ["خلاط مطبخ ذهبي", "Gold Kitchen Mixer", "MXR-KIT-GLD", "6002109876543", catMixers, null, supplierId2, unitPiece, 480, 25, 360, 20, 380, 540, 440, 8, 3, null, null, null],
    ["محبس بوابة 1/2 بوصة", "Gate Valve 1/2 inch", "VLV-GAT-12", "6001098765432", catValves, null, supplierId3, unitPiece, 35, 20, 28, 2, 30, 45, 35, 80, 15, null, null, null],
    ["شريط تيفلون", "Teflon Tape", "PLM-TEF-STD", "6000987654321", catPlumbing, null, supplierId3, unitPiece, 5, 30, 3.5, 0.5, 4, 8, 6, 500, 50, null, null, null],
    ["لصق بلاستيك PVC", "PVC Cement", "PLM-CEM-PVC", "6001111111111", catPlumbing, null, supplierId3, unitCan, 25, 20, 20, 2, 22, 35, 28, 60, 10, null, null, null],
  ];

  for (const p of products) {
    insertProduct.run(...p);
  }

  // Add opening stock movements
  const allProducts = db.prepare("SELECT id, currentStock FROM products").all() as any[];
  const insertMove = db.prepare(`
    INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, notes)
    VALUES (?, 'opening', ?, 0, ?, 'manual', 'رصيد افتتاحي')
  `);
  for (const p of allProducts) {
    if (p.currentStock > 0) {
      insertMove.run(p.id, p.currentStock, p.currentStock);
    }
  }
}
