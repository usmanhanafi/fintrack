import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatMoney, parseMoney, signedFor } from "../src/lib/money/index.ts";

test("parseMoney membaca format Indonesia", () => {
  assert.equal(parseMoney("12500"), 12500);
  assert.equal(parseMoney("12.500"), 12500);
  assert.equal(parseMoney("Rp 12.500"), 12500);
  assert.equal(parseMoney("35rb"), 35000);
  assert.equal(parseMoney("1,5jt"), 1500000);
  assert.equal(parseMoney("12k"), 12000);
});

test("parseMoney menghitung ekspresi", () => {
  assert.equal(parseMoney("12000+5000"), 17000);
  assert.equal(parseMoney("50rb-12500"), 37500);
});

test("parseMoney menolak masukan tidak valid", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseMoney("12abc"), null);
});

test("uang tidak pernah kehilangan presisi", () => {
  // Nilai ini akan meleset kalau disimpan sebagai float dan dibagi seratus.
  const total = [33_333, 33_333, 33_334].reduce((a, b) => a + b, 0);
  assert.equal(total, 100_000);
  assert.equal(formatMoney(total).replace(/\s/g, ""), "Rp100.000");
});

test("signedFor menentukan arah mutasi tiap akun", () => {
  const transfer = {
    type: "transfer",
    amount_minor: 100_000,
    account_id: "a",
    to_account_id: "b",
  };
  assert.equal(signedFor(transfer, "a"), -100_000);
  assert.equal(signedFor(transfer, "b"), 100_000);
  assert.equal(signedFor(transfer, "c"), 0);

  assert.equal(signedFor({ type: "expense", amount_minor: 500, account_id: "a" }, "a"), -500);
  assert.equal(signedFor({ type: "income", amount_minor: 500, account_id: "a" }, "a"), 500);
});
