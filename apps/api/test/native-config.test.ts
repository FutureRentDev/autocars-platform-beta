import { test } from "node:test";
import assert from "node:assert/strict";
test("standalone build config rejects missing or local API URLs before release", async () => {
  const previous = {
    profile: process.env.EAS_BUILD_PROFILE,
    api: process.env.EXPO_PUBLIC_API_URL,
  };
  const configUrl = new URL("../../mobile/app.config.ts", import.meta.url).href;
  try {
    process.env.EAS_BUILD_PROFILE = "production";
    delete process.env.EXPO_PUBLIC_API_URL;
    await assert.rejects(
      import(`${configUrl}?test=missing-api`),
      /Set EXPO_PUBLIC_API_URL/,
    );
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:4000";
    await assert.rejects(
      import(`${configUrl}?test=local-api`),
      /real HTTPS API/,
    );
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.invalid";
    await assert.rejects(
      import(`${configUrl}?test=placeholder-api`),
      /real HTTPS API/,
    );
    process.env.EXPO_PUBLIC_API_URL = "https://api.autocars.co.za";
    const config = (await import(`${configUrl}?test=config-only-no-network`))
      .default;
    assert.equal(config.expo.extra.apiUrl, "https://api.autocars.co.za");
    assert.ok(config.expo.plugins.includes("expo-dev-client"));
  } finally {
    if (previous.profile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = previous.profile;
    if (previous.api === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous.api;
  }
});
