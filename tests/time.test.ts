import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addDays,
  addMonths,
  daysInMonth,
  fromLocalInput,
  localDay,
  monthKey,
  monthRange,
  toLocalInput,
} from "../src/lib/time.ts";

test("localDay memakai zona Jakarta, bukan UTC", () => {
  // 23:30 WIB tanggal 1 masih hari yang sama, walaupun di UTC sudah tanggal 1 pukul 16:30.
  assert.equal(localDay("2026-09-01T16:30:00Z"), "2026-09-01");
  // 00:30 WIB tanggal 2 sudah hari berikutnya, walaupun UTC masih tanggal 1.
  assert.equal(localDay("2026-09-01T17:30:00Z"), "2026-09-02");
});

test("monthKey dan monthRange", () => {
  assert.equal(monthKey("2026-09-17"), "2026-09-01");
  assert.deepEqual(monthRange("2026-02-01"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2026-12-01"), { from: "2026-12-01", to: "2026-12-31" });
});

test("addMonths melewati batas tahun", () => {
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
});

test("daysInMonth menangani tahun kabisat", () => {
  assert.equal(daysInMonth("2028-02-01"), 29);
  assert.equal(daysInMonth("2026-02-01"), 28);
});

test("addDays melewati akhir bulan", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("input waktu lokal bolak-balik tanpa geser", () => {
  const iso = fromLocalInput("2026-09-01T23:30");
  assert.equal(iso, "2026-09-01T16:30:00.000Z");
  assert.equal(toLocalInput(iso), "2026-09-01T23:30");
  assert.equal(localDay(iso), "2026-09-01");
});
