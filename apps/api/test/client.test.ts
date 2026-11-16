import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient, ApiError } from "@autocars/core";
import { resolveApiUrl } from "../../mobile/src/api-url";
test("mobile API resolution supports both Expo Go phones, explicit emulators and release HTTPS", () => {
  assert.equal(
    resolveApiUrl({ development: true, hostUri: "192.168.1.45:8082" }),
    "http://192.168.1.45:4000",
  );
  assert.equal(
    resolveApiUrl({ development: true, hostUri: "localhost:8082" }),
    "http://localhost:4000",
  );
  assert.equal(
    resolveApiUrl({ development: true, explicit: "http://10.0.2.2:4000/" }),
    "http://10.0.2.2:4000",
  );
  assert.equal(
    resolveApiUrl({
      development: false,
      explicit: "https://api.example.co.za/",
    }),
    "https://api.example.co.za",
  );
  assert.throws(() => resolveApiUrl({ development: false }), /before building/);
  assert.throws(
    () =>
      resolveApiUrl({
        development: false,
        explicit: "http://192.168.1.45:4000",
      }),
    /HTTPS/,
  );
  assert.throws(
    () => resolveApiUrl({ development: true, hostUri: "test.exp.direct:8082" }),
    /npm run mobile/,
  );
});
test("API transport distinguishes expired login, offline errors, malformed data and timeout", async () => {
  const original = globalThis.fetch;
  const api = new ApiClient("https://api.example.com/", 15);
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "Sign in again." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(
      api.get("/auth/me"),
      (e) => e instanceof ApiError && e.status === 401,
    );
    globalThis.fetch = async () => {
      throw new TypeError("Network request failed");
    };
    await assert.rejects(
      api.get("/listings"),
      (e) =>
        e instanceof ApiError && e.status === 0 && /connect/.test(e.message),
    );
    globalThis.fetch = async () =>
      new Response("<html>error</html>", { status: 502 });
    await assert.rejects(
      api.get("/listings"),
      (e) => e instanceof ApiError && e.status === 502,
    );
    globalThis.fetch = async (_url, opts) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });
    await assert.rejects(api.get("/listings"), /longer than expected/);
    globalThis.fetch = async (_url, opts) => {
      const h = new Headers(opts?.headers);
      assert.equal(h.get("authorization"), "Bearer token-for-test");
      assert.equal(h.get("content-type"), "application/json");
      return new Response(JSON.stringify({ ok: true }));
    };
    api.token = "token-for-test";
    assert.deepEqual(await api.post("/auth/logout"), { ok: true });
  } finally {
    globalThis.fetch = original;
  }
});
