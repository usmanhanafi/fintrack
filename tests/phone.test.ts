import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizePhone } from "../src/lib/phone.ts";

test("normalizePhone menyeragamkan nomor Indonesia", () => {
  const expected = "+628123456789";
  assert.equal(normalizePhone("08123456789"), expected);
  assert.equal(normalizePhone("8123456789"), expected);
  assert.equal(normalizePhone("+62 812-3456-789"), expected);
  assert.equal(normalizePhone("62 812 3456 789"), expected);
});

test("normalizePhone menolak yang tidak masuk akal", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("081"), null);
  assert.equal(normalizePhone("bukan nomor"), null);
});
