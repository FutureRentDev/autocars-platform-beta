import { readFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { isIP } from "node:net";
export const projectRoot = resolve(import.meta.dirname, "..");
export function readEnv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}
export function projectEnvironment(root = projectRoot, env = process.env) {
  return {
    ...readEnv(resolve(root, ".env")),
    ...readEnv(resolve(root, ".env.local")),
    ...env,
  };
}
export function findLanAddress(interfaces = networkInterfaces()) {
  const candidates = Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses || [])
      .filter(
        (a) =>
          !a.internal &&
          (a.family === "IPv4" || a.family === 4) &&
          !a.address.startsWith("169.254."),
      )
      .map((a) => ({ name, address: a.address })),
  );
  const priority = (name) =>
    /^en0$|^wlan0$|^Wi-Fi$/.test(name)
      ? 0
      : /^en\d|^eth\d|^wlan\d|^Ethernet/.test(name)
        ? 1
        : /docker|veth|bridge|utun|tun|tailscale|vpn/i.test(name)
          ? 3
          : 2;
  candidates.sort(
    (a, b) =>
      priority(a.name) - priority(b.name) || a.name.localeCompare(b.name),
  );
  return candidates[0]?.address || null;
}
export function mobileConfiguration({
  env = process.env,
  interfaces = networkInterfaces(),
  args = [],
} = {}) {
  const apiPort = Number(env.PORT || 4000);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  const lan = env.AUTOCARS_DEV_HOST || findLanAddress(interfaces);
  if (lan && !isIP(lan))
    throw new Error(
      "AUTOCARS_DEV_HOST must be an IP address on your Mac reachable by your phone.",
    );
  const explicit = env.EXPO_PUBLIC_API_URL?.trim();
  if (!explicit && !lan)
    throw new Error(
      "No LAN address was found. Connect your Mac to Wi-Fi or set EXPO_PUBLIC_API_URL.",
    );
  const apiUrl = (explicit || `http://${lan}:${apiPort}`).replace(/\/$/, "");
  const parsed = new URL(apiUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "EXPO_PUBLIC_API_URL must be an HTTP(S) origin, without credentials or a path.",
    );
  const forwarded = args.filter((a) => a !== "--dry-run");
  if (forwarded.some((a) => a === "--dev-client" || a === "--localhost"))
    throw new Error(
      "This command is for Expo Go on physical devices. Use LAN or tunnel.",
    );
  const expoArgs = [
    "start",
    "--go",
    ...(forwarded.includes("--tunnel") ? [] : ["--lan"]),
    ...(!forwarded.some((a) => a === "--port" || a.startsWith("--port="))
      ? ["--port", env.EXPO_PORT || "8082"]
      : []),
    ...forwarded,
  ];
  return {
    apiUrl,
    lan,
    packagerHost: forwarded.includes("--tunnel")
      ? undefined
      : env.REACT_NATIVE_PACKAGER_HOSTNAME || lan || undefined,
    expoArgs,
    dryRun: args.includes("--dry-run"),
    tunnel: forwarded.includes("--tunnel"),
  };
}
