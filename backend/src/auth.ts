import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "./db.js";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_DAYS = 30;

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function createUser(username: string, password: string): Promise<string> {
  if (!pool) throw new Error("database unavailable");
  const normalized = username.trim().toLowerCase();
  const result = await pool.query(
    "INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3) RETURNING id",
    [randomBytes(16).toString("hex"), normalized, await hashPassword(password)]
  );
  return result.rows[0].id as string;
}

export async function authenticateUser(username: string, password: string): Promise<string | null> {
  if (!pool) return null;
  const normalized = username.trim().toLowerCase();
  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE username = $1",
    [normalized]
  );
  const row = result.rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  return row.id as string;
}

export async function createSession(userId: string): Promise<string> {
  if (!pool) throw new Error("database unavailable");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    [randomBytes(16).toString("hex"), userId, hashSessionToken(token), expiresAt]
  );
  return token;
}

export async function getUserIdFromSession(token: string): Promise<string | null> {
  if (!pool || !token) return null;
  const result = await pool.query(
    "SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()",
    [hashSessionToken(token)]
  );
  return result.rows[0]?.user_id ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  if (!pool || !token) return;
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
}
