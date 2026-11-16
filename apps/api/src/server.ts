import { resolve } from "node:path";
import { buildApp } from "./app";
const { app } = await buildApp({
  webRoot: resolve(import.meta.dirname, "../../web/dist"),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
await app.listen({
  port: Number(process.env.PORT) || 4000,
  host: process.env.HOST || "0.0.0.0",
});
