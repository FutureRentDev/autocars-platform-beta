import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import appConfigExport from "../../mobile/app.config";
// Expo's config loader and tsx may wrap this native-workspace CommonJS export.
const appConfig =
  typeof appConfigExport === "function"
    ? appConfigExport
    : (
        appConfigExport as {
          default: (context: { projectRoot: string }) => any;
        }
      ).default;

test("standalone builds validate API URLs and Android Firebase configuration", () => {
  const names = [
    "EAS_BUILD_PROFILE",
    "EXPO_PUBLIC_API_URL",
    "EAS_BUILD",
    "EAS_BUILD_PLATFORM",
    "GOOGLE_SERVICES_JSON",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const projectRoot = mkdtempSync(join(tmpdir(), "autocars-native-config-"));
  const config = () => appConfig({ projectRoot });
  try {
    delete process.env.EAS_BUILD;
    delete process.env.GOOGLE_SERVICES_JSON;
    process.env.EAS_BUILD_PROFILE = "production";
    delete process.env.EXPO_PUBLIC_API_URL;
    assert.throws(config, /Set EXPO_PUBLIC_API_URL/);
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:4000";
    assert.throws(config, /real HTTPS API/);
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.invalid";
    assert.throws(config, /real HTTPS API/);
    process.env.EXPO_PUBLIC_API_URL = "https://api.autocars.co.za";
    assert.equal(config().expo.extra.apiUrl, "https://api.autocars.co.za");
    assert.ok(config().expo.plugins.includes("expo-dev-client"));
    process.env.EAS_BUILD = "true";
    process.env.EAS_BUILD_PLATFORM = "android";
    assert.throws(config, /Android push requires/);
    const googleFile = join(projectRoot, "google-services.json");
    const client = (packageName: string) =>
      JSON.stringify({
        client: [
          {
            client_info: { android_client_info: { package_name: packageName } },
          },
        ],
      });
    writeFileSync(googleFile, client("com.unrelated.app"));
    assert.throws(config, /does not include the Android package/);
    writeFileSync(googleFile, client("za.co.autocars.app"));
    assert.equal(config().expo.android.googleServicesFile, googleFile);
    const fileVariable = join(projectRoot, "eas-file.json");
    writeFileSync(fileVariable, client("za.co.autocars.app"));
    process.env.GOOGLE_SERVICES_JSON = fileVariable;
    assert.equal(config().expo.android.googleServicesFile, fileVariable);
    delete process.env.GOOGLE_SERVICES_JSON;
    rmSync(googleFile);
    process.env.EAS_BUILD_PLATFORM = "ios";
    assert.doesNotThrow(config, "iOS must not require Firebase configuration");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
