import { backup } from "node:sqlite";
import { mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { openDatabase } from "./db";
const source = resolve(process.env.DATA_DIR || "./data");
const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Provide an absolute backup destination outside the data directory.",
  );
const target = resolve(destination);
if (target === source || target.startsWith(source + "/"))
  throw new Error("Backup must be outside DATA_DIR.");
await mkdir(target, { recursive: false });
const db = openDatabase(source);
try {
  await backup(db, resolve(target, "autocars.sqlite"));
  await cp(resolve(source, "uploads"), resolve(target, "uploads"), {
    recursive: true,
  });
  console.log(
    "Backup saved. Protect this directory: it contains personal data.",
  );
} finally {
  db.close();
}
