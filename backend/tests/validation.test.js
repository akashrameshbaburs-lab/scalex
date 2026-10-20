"use strict";

// Unit tests for the zod request schemas
// (src/middlewares/validation.ts -> dist/middlewares/validation.js).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { shortenSchema, codeParamSchema } = require("../dist/middlewares/validation.js");

// ---------------------------------------------------------------------------
// shortenSchema  (POST /api/shorten body)
// ---------------------------------------------------------------------------

test("shortenSchema accepts well-formed http and https URLs", () => {
  const valid = [
    "https://example.com",
    "http://example.com/path?x=1",
    "https://sub.example.org:8443/a/b#frag",
  ];
  for (const url of valid) {
    const result = shortenSchema.safeParse({ url });
    assert.equal(result.success, true, `expected ${url} to be accepted`);
    assert.equal(result.data.url, url);
  }
});

test("shortenSchema accepts a URL at exactly the 2048-char limit (boundary)", () => {
  const url = "https://example.com/" + "a".repeat(2028);
  assert.equal(url.length, 2048);
  assert.equal(shortenSchema.safeParse({ url }).success, true);
});

test("shortenSchema rejects URLs longer than 2048 chars with 'url too long'", () => {
  const url = "https://example.com/" + "a".repeat(2029); // 2049 chars
  const result = shortenSchema.safeParse({ url });
  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some((i) => i.message === "url too long"),
    `unexpected issues: ${JSON.stringify(result.error.issues)}`
  );
});

test("shortenSchema rejects a missing url field", () => {
  const result = shortenSchema.safeParse({});
  assert.equal(result.success, false);
  assert.equal(result.error.flatten().fieldErrors.url[0], "Required");
});

test("shortenSchema rejects empty and non-string url values", () => {
  for (const bad of ["", null, 123, ["https://x.io"]]) {
    const result = shortenSchema.safeParse({ url: bad });
    assert.equal(result.success, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("shortenSchema rejects scheme-less or syntactically invalid URLs", () => {
  for (const bad of ["example.com/path", "www.example.com", "not a url at all"]) {
    const result = shortenSchema.safeParse({ url: bad });
    assert.equal(result.success, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.ok(
      result.error.issues.some((i) => i.message === "must be a valid URL"),
      `unexpected issues for ${JSON.stringify(bad)}: ${JSON.stringify(result.error.issues)}`
    );
  }
});

test("shortenSchema requires absolute-URL syntax but does not restrict the scheme", () => {
  // Documents actual behavior of zod's .url(): any parseable absolute URL is
  // accepted here — there is NO http/https-only check in this schema layer.
  const result = shortenSchema.safeParse({ url: "ftp://files.example.com/pub/a" });
  assert.equal(result.success, true);
});

test("shortenSchema strips unknown fields from the payload", () => {
  const result = shortenSchema.safeParse({ url: "https://example.com", isAdmin: true });
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { url: "https://example.com" });
});

// ---------------------------------------------------------------------------
// codeParamSchema  (:code route param for /s/:code and /api/stats/:code)
// ---------------------------------------------------------------------------

test("codeParamSchema accepts alphanumeric codes up to 16 chars", () => {
  const valid = ["a", "0", "0123456789", "abcXYZ012", "a".repeat(16)];
  for (const code of valid) {
    const result = codeParamSchema.safeParse({ code });
    assert.equal(result.success, true, `expected ${JSON.stringify(code)} to be accepted`);
    assert.equal(result.data.code, code);
  }
});

test("codeParamSchema enforces length boundaries (0 rejected, 16 ok, 17 rejected)", () => {
  assert.equal(codeParamSchema.safeParse({ code: "" }).success, false);
  assert.equal(codeParamSchema.safeParse({ code: "a".repeat(16) }).success, true);
  assert.equal(codeParamSchema.safeParse({ code: "a".repeat(17) }).success, false);
});

test("codeParamSchema rejects characters outside [0-9A-Za-z] with 'invalid short code'", () => {
  const invalid = ["ab-c", "ab_c", "ab.cd", "../../etc", "ab cd", "ab$", "code日"];
  for (const code of invalid) {
    const result = codeParamSchema.safeParse({ code });
    assert.equal(result.success, false, `expected ${JSON.stringify(code)} to be rejected`);
    assert.ok(
      result.error.issues.some((i) => i.message === "invalid short code"),
      `unexpected issues for ${JSON.stringify(code)}: ${JSON.stringify(result.error.issues)}`
    );
  }
});

test("codeParamSchema rejects non-string and missing code values", () => {
  assert.equal(codeParamSchema.safeParse({ code: 42 }).success, false);
  assert.equal(codeParamSchema.safeParse({ code: null }).success, false);
  assert.equal(codeParamSchema.safeParse({}).success, false);
});
