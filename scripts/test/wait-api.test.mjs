import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForApi } from "../wait-api.mjs";

test("web startup waits through refused connections and unhealthy responses", async () => {
  let attempts = 0;
  await waitForApi("http://127.0.0.1:4000/api/health", {
    retryMs: 1,
    request: async () => {
      attempts++;
      if (attempts === 1) throw new Error("ECONNREFUSED");
      if (attempts === 2) return Response.json({ ok: false });
      if (attempts === 3) return Response.json({ ok: true }, { status: 503 });
      return Response.json({ ok: true });
    },
  });
  assert.equal(attempts, 4);
});

test("web startup fails clearly if the API never becomes ready", async () => {
  await assert.rejects(
    waitForApi("http://127.0.0.1:4000/api/health", {
      timeoutMs: 15,
      retryMs: 1,
      request: async () => {
        throw new Error("ECONNREFUSED");
      },
    }),
    /Check the \[api\] startup output/,
  );
});
