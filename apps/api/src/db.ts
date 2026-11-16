import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
export function openDatabase(directory: string) {
  if (directory !== ":memory:") mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(
    directory === ":memory:"
      ? directory
      : resolve(directory, "autocars.sqlite"),
  );
  db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL,featured INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS listings_status ON listings(status,created_at);
CREATE INDEX IF NOT EXISTS listings_owner ON listings(owner_id);
CREATE TABLE IF NOT EXISTS favourites(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,PRIMARY KEY(user_id,listing_id));
CREATE TABLE IF NOT EXISTS searches(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,filters TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,buyer_id TEXT REFERENCES users(id) ON DELETE SET NULL,name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,path TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,target TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS listings_price ON listings(status, CAST(json_extract(data,'$.price') AS INTEGER));
CREATE INDEX IF NOT EXISTS listings_make ON listings(status, lower(json_extract(data,'$.make')));
INSERT OR IGNORE INTO migrations(version) VALUES(1);
`);
  if (!db.prepare("SELECT version FROM migrations WHERE version=2").get()) {
    db.exec(`BEGIN;
    CREATE TABLE IF NOT EXISTS account_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,account_type TEXT NOT NULL CHECK(account_type IN ('customer','business')));
    CREATE TABLE IF NOT EXISTS business_applications(id TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL CHECK(status IN ('pending','contacted','active','rejected','suspended')),data TEXT NOT NULL,review_note TEXT NOT NULL DEFAULT '',agreement_reference TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS business_status ON business_applications(status,created_at);
    INSERT INTO migrations(version) VALUES(2);COMMIT;`);
  }
  if (!db.prepare("SELECT version FROM migrations WHERE version=3").get()) {
    db.exec(`BEGIN;
    CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,amount INTEGER NOT NULL,status TEXT NOT NULL,card_last4 TEXT NOT NULL DEFAULT '',listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id,created_at);
    INSERT INTO migrations(version) VALUES(3);COMMIT;`);
  }
  if (!db.prepare("SELECT version FROM migrations WHERE version=4").get()) {
    db.exec(`BEGIN;
    CREATE TABLE IF NOT EXISTS push_tokens(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token TEXT NOT NULL,platform TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(user_id,token));
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_lead ON messages(lead_id,created_at);
    INSERT INTO migrations(version) VALUES(4);COMMIT;`);
  }
  if (!db.prepare("SELECT version FROM migrations WHERE version=5").get()) {
    db.exec(`BEGIN;
    CREATE TABLE IF NOT EXISTS push_subscriptions(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,endpoint TEXT PRIMARY KEY,keys TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO migrations(version) VALUES(5);COMMIT;`);
  }
  if (!db.prepare("SELECT version FROM migrations WHERE version=6").get()) {
    db.exec(`BEGIN;
    CREATE TABLE IF NOT EXISTS lead_reads(lead_id TEXT NOT NULL,user_id TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(lead_id,user_id));
    INSERT INTO migrations(version) VALUES(6);COMMIT;`);
  }
  if (!db.prepare("SELECT version FROM migrations WHERE version=7").get())
    db.exec(`BEGIN;
    CREATE TABLE IF NOT EXISTS notification_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,platform TEXT NOT NULL,subscription_key TEXT UNIQUE NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,path TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT);
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at);
    CREATE TABLE IF NOT EXISTS push_jobs(id TEXT PRIMARY KEY,notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES notification_subscriptions(id) ON DELETE CASCADE,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,ticket_id TEXT,last_error TEXT);
    CREATE INDEX IF NOT EXISTS push_jobs_due ON push_jobs(status,next_at);
    INSERT INTO migrations(version) VALUES(7);COMMIT;`);
  if (!db.prepare("SELECT version FROM migrations WHERE version=8").get())
    db.exec(`BEGIN;
    CREATE TABLE payment_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,amount INTEGER NOT NULL,status TEXT NOT NULL,purpose TEXT NOT NULL,provider_id TEXT UNIQUE,listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,error TEXT NOT NULL DEFAULT '');
    CREATE INDEX payment_orders_user ON payment_orders(user_id,created_at);
    INSERT INTO migrations(version) VALUES(8);COMMIT;`);
  return db;
}
