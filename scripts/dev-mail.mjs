import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  projectRoot,
  projectEnvironment,
  findLanAddress,
} from "./local-config.mjs";
const env = projectEnvironment();
if (env.NODE_ENV === "production")
  throw new Error("Local email testing cannot run in production.");
const brand = JSON.parse(
  readFileSync(resolve(projectRoot, "config/brand.json"), "utf8"),
);
const lan = env.AUTOCARS_DEV_HOST || findLanAddress();
const origin = `http://${lan || "localhost"}:${env.WEB_DEV_PORT || 5173}`;
console.log(
  `Local email testing: start Mailpit with npm run mail:start first.\nInbox: http://localhost:8025\nEmail links open: ${origin}\nNo messages are sent to real recipients.`,
);
const childEnv = {
  ...env,
  SMTP_URL: "smtp://127.0.0.1:1025?ignoreTLS=true",
  MAIL_FROM: `${brand.name} <no-reply@autocars.test>`,
  WEB_ORIGIN: [
    ...new Set([
      origin,
      ...(env.WEB_ORIGIN || "http://localhost:5173").split(","),
    ]),
  ].join(","),
};
if (process.argv.includes("--dry-run")) {
  console.log("Dry run. No server was started.");
  process.exit(0);
}
const child = spawn(
  process.execPath,
  [
    resolve(projectRoot, "node_modules/concurrently/dist/bin/concurrently.js"),
    "-k",
    "-n",
    "api,web",
    "npm run dev -w @autocars/api",
    "npm run dev -w @autocars/web",
  ],
  { cwd: projectRoot, stdio: "inherit", env: childEnv },
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
