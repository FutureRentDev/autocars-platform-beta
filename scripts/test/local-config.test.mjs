import { test } from "node:test";
import assert from "node:assert/strict";
import { findLanAddress, mobileConfiguration } from "../local-config.mjs";
const interfaces = {
  lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
  utun0: [{ address: "100.64.0.1", family: "IPv4", internal: false }],
  en0: [
    { address: "192.168.1.22", family: "IPv4", internal: false },
    { address: "fe80::1", family: "IPv6", internal: false },
  ],
  bridge100: [{ address: "192.168.64.1", family: "IPv4", internal: false }],
};
test("phones use Wi-Fi instead of loopback, bridge or VPN", () => {
  assert.equal(findLanAddress(interfaces), "192.168.1.22");
  const c = mobileConfiguration({ env: {}, interfaces });
  assert.equal(c.apiUrl, "http://192.168.1.22:4000");
  assert.equal(c.packagerHost, "192.168.1.22");
  assert.deepEqual(c.expoArgs, ["start", "--go", "--lan", "--port", "8082"]);
});
test("explicit API origin and port are respected, including tunnel", () => {
  const c = mobileConfiguration({
    env: { EXPO_PUBLIC_API_URL: "https://api.example.com/" },
    interfaces: {},
    args: ["--tunnel", "--port", "8088", "--dry-run"],
  });
  assert.equal(c.apiUrl, "https://api.example.com");
  assert.ok(!c.expoArgs.includes("--lan"));
  assert.ok(!c.expoArgs.includes("--dry-run"));
  assert.equal(c.dryRun, true);
  assert.equal(c.tunnel, true);
  assert.equal(c.packagerHost, undefined);
});
test("misconfigured hosts and missing networking fail before starting Expo", () => {
  assert.throws(
    () => mobileConfiguration({ env: {}, interfaces: {} }),
    /No LAN/,
  );
  assert.throws(
    () =>
      mobileConfiguration({
        env: { AUTOCARS_DEV_HOST: "bad host" },
        interfaces,
      }),
    /AUTOCARS_DEV_HOST/,
  );
  assert.throws(
    () =>
      mobileConfiguration({
        env: { EXPO_PUBLIC_API_URL: "https://user:password@example.com/api" },
        interfaces,
      }),
    /without credentials/,
  );
  assert.throws(
    () => mobileConfiguration({ env: { PORT: "-1" }, interfaces }),
    /PORT/,
  );
  assert.throws(
    () => mobileConfiguration({ env: {}, interfaces, args: ["--dev-client"] }),
    /Expo Go/,
  );
});
