"use strict";

// Unit tests for the base62 short-code encoder (src/utils/base62.ts -> dist/utils/base62.js).
// Pure logic only: no network, no database, no redis.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { encode } = require("../dist/utils/base62.js");

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE62_RE = /^[0-9A-Za-z]+$/;

// Independent reference decoder. Only used to verify that encode() round-trips;
// it is intentionally written differently (left-to-right Horner's method).
function decodeReference(code) {
  let n = 0n;
  for (const ch of code) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid character ${JSON.stringify(ch)} in short code`);
    n = n * 62n + BigInt(idx);
  }
  return n;
}

test('encode(0) is the single character "0"', () => {
  assert.equal(encode(0n), "0");
});

test("encode matches known base62 values at digit boundaries", () => {
  assert.equal(encode(1n), "1");
  assert.equal(encode(9n), "9");
  assert.equal(encode(10n), "A"); // first uppercase digit after 9
  assert.equal(encode(61n), "z"); // last digit of the alphabet
  assert.equal(encode(62n), "10"); // 62 = 1 * 62 + 0
  assert.equal(encode(3843n), "zz"); // 62^2 - 1
  assert.equal(encode(3844n), "100"); // 62^2
});

test("output contains only the 62-char alphabet and has no leading zeros (ids 0..4999)", () => {
  for (let i = 0; i <= 4999; i++) {
    const code = encode(BigInt(i));
    assert.match(code, BASE62_RE, `id ${i} produced non-base62 output: ${code}`);
    if (i > 0) assert.notEqual(code[0], "0", `id ${i} produced non-canonical code: ${code}`);
  }
});

test("sequential ids 0..4999 produce unique codes (collision-free)", () => {
  const seen = new Set();
  for (let i = 0; i <= 4999; i++) seen.add(encode(BigInt(i)));
  assert.equal(seen.size, 5000);
});

test("uniqueness holds across a strided, non-sequential id sample (3000 ids)", () => {
  const seen = new Set();
  for (let i = 0; i < 3000; i++) seen.add(encode(BigInt(i) * 7919n + 123456789n));
  assert.equal(seen.size, 3000);
});

test("encode/decode round-trips through an independent decoder", () => {
  const ids = [];
  for (let i = 0; i <= 1000; i++) ids.push(BigInt(i)); // sequential range
  for (let i = 0; i < 500; i++) ids.push(BigInt(i) * 7919n + 123456789n); // strided
  // values beyond Number.MAX_SAFE_INTEGER (BigInt path) and the BIGSERIAL max
  ids.push(2n ** 53n + 1n, 10n ** 15n, 10n ** 18n, 2n ** 63n - 1n);
  for (const id of ids) {
    assert.equal(decodeReference(encode(id)), id, `round-trip failed for id ${id}`);
  }
});

test("BIGSERIAL max (2^63-1) encodes to exactly 11 chars and round-trips", () => {
  const max = 2n ** 63n - 1n;
  const code = encode(max);
  // 62^10 < 2^63-1 < 62^11, so 11 digits are required and sufficient.
  assert.equal(code.length, 11);
  assert.match(code, BASE62_RE);
  assert.equal(decodeReference(code), max);
});

test("encode is deterministic for the same input", () => {
  const ids = [0n, 1n, 12345n, 987654321n, 2n ** 62n, 2n ** 63n - 1n];
  // encode twice in interleaved order to catch any hidden state
  const first = ids.map((id) => encode(id));
  const second = ids.map((id) => encode(id));
  for (let i = 0; i < ids.length; i++) {
    assert.equal(first[i], second[i], `encode not deterministic for id ${ids[i]}`);
  }
});
