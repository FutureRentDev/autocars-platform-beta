import { openDatabase } from "./db";
import { hashPassword } from "./auth";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question("Admin email: ")).trim().toLowerCase();
const name = (await rl.question("Admin name: ")).trim();
console.log(
  "Enter a unique password of at least 12 characters (input is visible in this terminal).",
);
const password = await rl.question("Password: ");
rl.close();
if (!/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 12)
  throw new Error("Invalid email, name, or password.");
const db = openDatabase(process.env.DATA_DIR || "./data");
const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email);
if (existing)
  throw new Error(
    "Account already exists. Use an unused email to provision an administrator.",
  );
db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
  randomUUID(),
  name,
  email,
  await hashPassword(password),
  "admin",
  1,
  new Date().toISOString(),
);
db.close();
console.log("Administrator created. Sign in through the web application.");
