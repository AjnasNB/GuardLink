import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt, hash } from "../src/lib.ts";
test("medical bytes are encrypted and tampering is rejected", async () => {
  const source = new TextEncoder().encode("SYNTHETIC MEDICAL EVIDENCE").buffer;
  const encrypted = await encrypt(source, "test-only-key");
  assert.notEqual(
    new TextDecoder().decode(encrypted.ciphertext),
    "SYNTHETIC MEDICAL EVIDENCE",
  );
  assert.equal(
    new TextDecoder().decode(
      await decrypt(encrypted.ciphertext, encrypted.iv, "test-only-key"),
    ),
    "SYNTHETIC MEDICAL EVIDENCE",
  );
  await assert.rejects(() =>
    decrypt(encrypted.ciphertext, encrypted.iv, "wrong-key"),
  );
  const changed = new Uint8Array(encrypted.ciphertext);
  changed[0] ^= 1;
  await assert.rejects(() =>
    decrypt(changed.buffer, encrypted.iv, "test-only-key"),
  );
});
test("encryption requires configured key and content hashes are deterministic", async () => {
  await assert.rejects(() => encrypt(new ArrayBuffer(0), ""));
  assert.equal(await hash("evidence"), await hash("evidence"));
  assert.notEqual(await hash("evidence"), await hash("changed"));
});
