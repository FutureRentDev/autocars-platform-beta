import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  projectRoot,
  findLanAddress,
  projectEnvironment,
} from "./local-config.mjs";
const target = resolve(projectRoot, ".env");
if (!existsSync(target)) {
  await copyFile(resolve(projectRoot, ".env.example"), target);
  console.log("Created .env from .env.example.");
} else console.log("Kept existing .env.");
const env = projectEnvironment();
if (env.NODE_ENV === "production")
  throw new Error(
    "This environment is configured for production. Use a separate development checkout.",
  );
await mkdir(resolve(projectRoot, "apps/api/data/uploads"), { recursive: true });
const lan = env.AUTOCARS_DEV_HOST || findLanAddress();
console.log(
  `Local setup complete. ${lan ? `Detected LAN address: ${lan}` : "No LAN address found; connect to Wi-Fi before launching Expo Go."}`,
);
console.log(
  "No accounts were created and no server was started.\nNext: npm run admin (once), npm run dev, then npm run mobile in a second terminal.",
);
