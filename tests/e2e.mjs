// Uji alur nyata di browser: catat saat offline, data bertahan setelah muat ulang.
import { chromium } from "playwright";
import assert from "node:assert";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const shots = process.argv[2];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByText("Total saldo").waitFor();

// Kategori bawaan harus sudah ada di IndexedDB setelah seed.
const categoryCount = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("fintrack");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return new Promise((resolve) => {
    const tx = db.transaction("categories", "readonly").objectStore("categories").count();
    tx.onsuccess = () => resolve(tx.result);
  });
});
assert.equal(categoryCount, 15, `kategori bawaan seharusnya 15, dapat ${categoryCount}`);

// Mode pesawat: input harus tetap jalan.
await context.setOffline(true);

await page.getByLabel("Tambah transaksi").click();
await page.getByRole("dialog").waitFor();
for (const key of ["2", "5", "000"]) await page.getByRole("button", { name: key, exact: true }).click();
await page.getByRole("button", { name: "Makan dan Minum" }).click();
if (shots) await page.screenshot({ path: `${shots}/form.png` });
await page.getByRole("button", { name: /^Simpan Rp/ }).click();
await page.getByRole("dialog").waitFor({ state: "detached" });

await page.getByText(/Rp\s?25\.000/).first().waitFor();
if (shots) await page.screenshot({ path: `${shots}/dashboard.png`, fullPage: true });

// Muat ulang masih offline: data harus tetap ada, tanpa jaringan sama sekali.
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await context.setOffline(false);
await page.reload({ waitUntil: "networkidle" });
await page.getByText(/Rp\s?25\.000/).first().waitFor();

// Saldo total ikut berubah, jadi perhitungan saldo memang turunan dari mutasi.
const balance = await page.locator("p.tabular").first().innerText();
assert.match(balance, /-\s?Rp\s?25\.000/, `saldo total seharusnya minus 25 ribu, dapat ${balance}`);

// Halaman lain harus ikut merender data yang sama.
for (const [path, marker] of [
  ["/transactions", "1 transaksi"],
  ["/budgets", "Total budget"],
  ["/reports", "Per kategori"],
  ["/settings", "Akun dan dompet"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.getByText(marker).first().waitFor();
  if (shots) await page.screenshot({ path: `${shots}/page${path.replace("/", "-")}.png`, fullPage: true });
}

// Budget: pasang batas, lalu progresnya harus ikut transaksi tadi.
await page.goto(`${BASE}/budgets`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Makan dan Minum/ }).click();
await page.getByLabel(/Batas bulanan/).fill("100rb");
await page.getByRole("button", { name: "Simpan" }).click();
await page.getByText(/Sisa Rp\s?75\.000/).waitFor();
if (shots) await page.screenshot({ path: `${shots}/budgets-set.png`, fullPage: true });

// Panjang bilah harus sebanding dengan pemakaian, bukan sekadar ada.
const bars = await page.evaluate(() =>
  [...document.querySelectorAll("div.h-full.rounded-full")].map((el) => ({
    width: el.getBoundingClientRect().width,
    track: el.parentElement.getBoundingClientRect().width,
  })),
);
assert.ok(bars.length >= 2, "seharusnya ada bilah total dan bilah kategori");
for (const bar of bars) {
  const ratio = bar.width / bar.track;
  assert.ok(
    Math.abs(ratio - 0.25) < 0.02,
    `bilah seharusnya seperempat penuh, dapat ${(ratio * 100).toFixed(0)}%`,
  );
}

const outbox = await page.evaluate(async () => {
  const db = await new Promise((resolve) => {
    const req = indexedDB.open("fintrack");
    req.onsuccess = () => resolve(req.result);
  });
  return new Promise((resolve) => {
    const tx = db.transaction("outbox", "readonly").objectStore("outbox").count();
    tx.onsuccess = () => resolve(tx.result);
  });
});
assert.ok(outbox > 0, "perubahan harus mengantre di outbox saat Supabase belum disiapkan");

await browser.close();

const real = errors.filter((e) => !/favicon|503|Failed to load resource/i.test(e));
if (real.length) {
  console.error("Error di browser:\n" + real.join("\n"));
  process.exit(1);
}
console.log(`E2E lulus. Kategori ${categoryCount}, saldo ${balance}, outbox ${outbox}.`);
