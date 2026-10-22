import { test as base, expect, type Page } from "@playwright/test";

const test = base.extend<{}, { session: any }>({
  session: [async ({ playwright }, use) => {
    const api = await playwright.request.newContext({ baseURL: "http://127.0.0.1:18881" });
    const res = await api.post("/api/auth/login", { data: { username: "mobile-test", password: "Mobile-test-only-2468!" } });
    expect(res.ok()).toBeTruthy();
    await use(await res.json());
    await api.dispose();
  }, { scope: "worker" }],
});

test.beforeEach(async ({ page, session }) => {
  await page.addInitScript(user => localStorage.setItem("pos_user", JSON.stringify(user)), session);
});

test("login and logout remain usable on a phone", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("pos_user"));
  await page.goto("/");
  await page.getByLabel("اسم المستخدم", { exact: true }).fill("mobile-test");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("Mobile-test-only-2468!");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page.locator("main")).toBeVisible();
  await fits(page);
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page.getByRole("button", { name: "دخول", exact: true })).toBeVisible();
});

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const elements = [document.documentElement, document.querySelector("main"), ...document.querySelectorAll("[data-app-dialog]")];
    return elements.filter((e): e is HTMLElement => e instanceof HTMLElement).map(e => ({
      name: e.tagName, overflow: e.scrollWidth - e.clientWidth,
      outside: e.getBoundingClientRect().left < -1 || e.getBoundingClientRect().right > innerWidth + 1,
    })).filter(e => e.overflow > 2 || e.outside);
  })).toEqual([]);
}

test("all pages and tabs fit the viewport, navigation works by touch", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  for (const route of ["/", "/pos", "/quotations", "/sales", "/returns", "/purchases", "/products", "/inventory", "/customers", "/craftsmen", "/suppliers", "/debts", "/reports", "/expenses", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await fits(page);
    const tabs = page.getByRole("tab");
    for (let i = 0; i < await tabs.count(); i++) {
      await tabs.nth(i).click();
      await page.waitForLoadState("networkidle");
      await fits(page);
    }
  }
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "فتح القائمة الرئيسية" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "الكاشير", exact: true }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "فتح القائمة الرئيسية" }).click();
    await page.getByRole("button", { name: "إغلاق القائمة" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("creation forms and their last actions stay reachable", async ({ page }) => {
  for (const [route, label] of [["/products", "منتج جديد"], ["/customers", "عميل جديد"], ["/craftsmen", "إضافة صنايعي"], ["/purchases", "فاتورة مشتريات"], ["/quotations", "تسعيرة جديدة"]]) {
    await page.goto(route);
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await fits(page);
    const last = dialog.getByRole("button").filter({ hasNot: page.locator(".sr-only") }).last();
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    await page.keyboard.press("Escape");
  }
});

test("cashier edits quantity, surcharge and total then saves a real test sale", async ({ page, request, session }, info) => {
  const headers = { Authorization: `Bearer ${session.token}` };
  await request.delete("/api/drafts/sales_invoice/new", { headers });
  const name = `منتج اختبار الموبايل ${info.project.name}`;
  const created = await request.post("/api/products", { headers, data: {
    nameAr: name, sku: `MOBILE-${info.project.name}-${Date.now()}`, currentStock: 100, sellingPrice: 20, trueCost: 10, soldByWeight: 1,
  } });
  expect(created.ok()).toBeTruthy();
  const product = await created.json();
  await page.goto("/pos");
  await page.getByPlaceholder("ابحث بالاسم أو الكود أو الباركود...").fill(product.sku);
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("textbox", { name: `كمية ${name}`, exact: true }).fill("2.5");
  await page.getByRole("textbox", { name: `خصم ${name}`, exact: true }).fill("-5");
  await expect(page.getByRole("textbox", { name: `إجمالي ${name}`, exact: true })).toHaveValue("55");
  await page.getByRole("textbox", { name: `إجمالي ${name}`, exact: true }).fill("60");
  await page.getByRole("textbox", { name: `إجمالي ${name}`, exact: true }).blur();
  await expect(page.getByRole("textbox", { name: `خصم ${name}`, exact: true })).toHaveValue("-10");
  await fits(page);
  await page.screenshot({ path: info.outputPath("cashier.png"), fullPage: true });
  await page.getByRole("button", { name: "إنهاء الفاتورة", exact: true }).click();
  await fits(page);
  const saved = page.waitForResponse(r => /\/api\/sales\/\d+\/finalize/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("dialog").getByRole("button", { name: "إنهاء الفاتورة", exact: true }).click();
  const savedResponse = await saved;
  expect(savedResponse.ok()).toBeTruthy();
  const sale = await savedResponse.json();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await request.get(`/api/products/${product.id}`, { headers });
  expect((await after.json()).currentStock).toBe(97.5);
  await page.goto(`/sales?open=${sale.id}`);
  await expect(page.locator(".invoice-print")).toBeVisible();
  await fits(page);
  await page.getByRole("dialog").getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.goto("/returns");
  await page.getByPlaceholder("مثال: INV-2026-000003").fill(sale.serial);
  await page.getByRole("button", { name: "عرض الفاتورة", exact: true }).click();
  await page.getByRole("row").filter({ hasText: name }).first().getByRole("textbox").fill("1");
  await fits(page);
  const returned = page.waitForResponse(r => r.url().endsWith("/api/returns") && r.request().method() === "POST");
  await page.getByRole("button", { name: "تأكيد المرتجع وطباعة الإيصال", exact: true }).click();
  expect((await returned).ok()).toBeTruthy();
  await expect.poll(async () => (await (await request.get(`/api/products/${product.id}`, { headers })).json()).currentStock).toBe(98.5);
});

test("customer, supplier and craftsman profiles keep actions and tabs accessible", async ({ page, request, session }, info) => {
  const headers = { Authorization: `Bearer ${session.token}` };
  for (const [route, label] of [["/customers", "عميل"], ["/suppliers", "مورد"], ["/craftsmen", "صنايعي"]]) {
    const name = `${label} اختبار اسم طويل للموبايل ${info.project.name}`;
    const created = await request.post(`/api${route}`, { headers, data: { name, phone: "01000000000", openingBalance: 100, commissionPercent: 5 } });
    expect(created.ok()).toBeTruthy();
    await page.goto(route);
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "عرض", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await fits(page);
    const tabs = page.getByRole("dialog").getByRole("tab");
    for (let i = 0; i < await tabs.count(); i++) {
      await tabs.nth(i).click();
      await fits(page);
    }
    await page.keyboard.press("Escape");
  }
});

test("backup download and user settings are reachable", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "النسخ الاحتياطي", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "إنشاء نسخة احتياطية", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^backup-.*\.zip$/);
  await fits(page);
  await page.getByRole("button", { name: "إعداد GitHub (مرة واحدة)", exact: true }).click();
  await fits(page);
  await page.getByRole("tab", { name: "المستخدمون", exact: true }).click();
  await page.getByRole("button", { name: "إضافة مستخدم", exact: true }).click();
  await fits(page);
  await page.getByRole("dialog").getByRole("button", { name: "إلغاء", exact: true }).click();
});

test("purchase and quotation line editors save through touch-accessible controls", async ({ page, request, session }, info) => {
  const headers = { Authorization: `Bearer ${session.token}` };
  const suffix = `${info.project.name}-${Date.now()}`;
  const supplierName = `مورد فواتير ${suffix}`;
  expect((await request.post("/api/suppliers", { headers, data: { name: supplierName } })).ok()).toBeTruthy();
  const productName = `صنف فاتورة ${suffix}`;
  const sku = `FORM-${suffix}`;
  const product = await request.post("/api/products", { headers, data: { nameAr: productName, sku, sellingPrice: 20, listPrice: 10, currentStock: 10 } });
  expect(product.ok()).toBeTruthy();
  await request.delete("/api/drafts/purchase/new", { headers });
  await request.delete("/api/drafts/quotation/new", { headers });
  await page.goto("/purchases");
  await page.getByRole("button", { name: "فاتورة مشتريات", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: supplierName, exact: true }).click();
  await dialog.getByPlaceholder("ابحث عن منتج للإضافة...").fill(sku);
  await dialog.getByText(`${productName} (${sku})`, { exact: true }).click();
  await dialog.getByRole("row").filter({ hasText: productName }).getByRole("textbox").first().fill("3");
  await fits(page);
  const purchase = page.waitForResponse(r => r.url().endsWith("/api/purchases") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  expect((await purchase).ok()).toBeTruthy();
  await expect(dialog).toHaveCount(0);

  await page.goto("/quotations");
  await page.getByRole("button", { name: "تسعيرة جديدة", exact: true }).click();
  await dialog.getByPlaceholder("ابحث عن منتج...").fill(sku);
  await dialog.getByText(productName, { exact: false }).first().click();
  await dialog.getByRole("row").filter({ hasText: productName }).getByRole("textbox").fill("-5");
  await fits(page);
  const quotation = page.waitForResponse(r => r.url().endsWith("/api/quotations") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "حفظ التسعيرة", exact: true }).click();
  expect((await quotation).ok()).toBeTruthy();
});

test("administrator changes username and password from settings without Railway variables", async ({ page, request, session }, info) => {
  // Cover both mobile browser engines without exhausting the login rate limit.
  test.skip(!["small-phone", "iphone"].includes(info.project.name));
  const username = `settings-${info.project.name}`;
  const password = "Old-test-password-2468!";
  const nextPassword = "Changed-in-settings-8642!";
  const headers = { Authorization: `Bearer ${session.token}` };
  const created = await request.post("/api/users", { headers, data: { username, password, name: "حساب اختبار تغيير الدخول", role: "staff", permissions: ["/pos"] } });
  expect(created.ok()).toBeTruthy();
  const oldLogin = await request.post("/api/auth/login", { data: { username, password } });
  expect(oldLogin.ok()).toBeTruthy();
  const oldToken = (await oldLogin.json()).token;
  await page.goto("/settings?tab=users");
  await page.getByRole("tab", { name: "المستخدمون", exact: true }).click();
  await page.getByRole("row").filter({ hasText: username }).getByRole("button", { name: "تعديل", exact: true }).click();
  await page.getByLabel("اسم المستخدم *", { exact: true }).fill(`${username}-new`);
  await page.getByLabel("كلمة مرور جديدة (اتركها فارغة لو مش هتتغير)", { exact: true }).fill(nextPassword);
  await fits(page);
  const changed = page.waitForResponse(r => /\/api\/users\/\d+$/.test(r.url()) && r.request().method() === "PATCH");
  await page.getByRole("dialog").getByRole("button", { name: "حفظ", exact: true }).click();
  expect((await changed).ok()).toBeTruthy();
  expect((await request.get("/api/auth/me", { headers: { Authorization: `Bearer ${oldToken}` } })).status()).toBe(401);
  expect((await request.post("/api/auth/login", { data: { username, password } })).status()).toBe(401);
  const nextLogin = await request.post("/api/auth/login", { data: { username: `${username}-new`, password: nextPassword } });
  expect(nextLogin.ok()).toBeTruthy();
});
