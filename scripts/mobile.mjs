import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  mobileConfiguration,
  projectEnvironment,
  projectRoot,
  readEnv,
} from "./local-config.mjs";
const mobileRoot = resolve(projectRoot, "apps/mobile");
// Precedence: shell, native .env.local, native .env, root .env.local, root .env, LAN detection.
const env = {
  ...projectEnvironment(projectRoot, {}),
  ...readEnv(resolve(mobileRoot, ".env")),
  ...readEnv(resolve(mobileRoot, ".env.local")),
  ...process.env,
};
try {
  if (env.NODE_ENV === "production")
    throw new Error(
      "Expo Go is a development workflow. Unset NODE_ENV=production in this terminal.",
    );
  const config = mobileConfiguration({ env, args: process.argv.slice(2) });
  console.log(
    `\nAutoCars · Expo Go (iOS + Android)\nAPI: ${config.apiUrl}\nMetro port: ${config.expoArgs[config.expoArgs.indexOf("--port") + 1] || "custom"}\n`,
  );
  console.log(
    "Start the API separately with npm run dev. Your phone and Mac must be on the same reachable Wi-Fi network.",
  );
  console.log(
    "On physical iOS, sign Expo CLI and Expo Go in to the same Expo account (npm run expo:login).",
  );
  if (config.tunnel)
    console.log(
      "A Metro tunnel carries the JavaScript bundle only. The phone must still reach the API URL above.",
    );
  if (config.dryRun) {
    console.log(
      `Dry run: expo ${config.expoArgs.join(" ")}\nNo server was started.`,
    );
    process.exit(0);
  }
  const child = spawn(
    process.execPath,
    [resolve(projectRoot, "node_modules/expo/bin/cli"), ...config.expoArgs],
    {
      cwd: mobileRoot,
      stdio: "inherit",
      env: {
        ...env,
        EXPO_PUBLIC_API_URL: config.apiUrl,
        ...(config.packagerHost
          ? { REACT_NATIVE_PACKAGER_HOSTNAME: config.packagerHost }
          : {}),
      },
    },
  );
  child.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
} catch (e) {
  console.error(`\n${e.message}`);
  process.exitCode = 1;
}
