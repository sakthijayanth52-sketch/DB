import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export async function ensureSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_response_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS memories (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_user_created ON memories (user_id, created_at);
  `);
}

export async function createConversation(userId: string): Promise<string> {
  if (!pool) return randomUUID();
  const id = randomUUID();
  await pool.query("INSERT INTO conversations (id, user_id) VALUES ($1, $2)", [id, userId]);
  return id;
}

export async function conversationExists(id: string, userId: string): Promise<boolean> {
  if (!pool) return true;
  const result = await pool.query("SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2", [id, userId]);
  return result.rowCount === 1;
}

export async function saveMessage(
  conversationId: string,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  if (!pool) return;
  await pool.query(
    "INSERT INTO messages (id, conversation_id, user_id, role, content) VALUES ($1, $2, $3, $4, $5)",
    [randomUUID(), conversationId, userId, role, content]
  );
}

export async function listMessages(conversationId: string, userId: string, limit = 50): Promise<StoredMessage[]> {
  if (!pool) return [];
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const result = await pool.query(
    `SELECT role, content, created_at
     FROM messages
     WHERE conversation_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [conversationId, userId, safeLimit]
  );
  return result.rows.reverse().map((row) => ({
    role: row.role,
    content: row.content,
    createdAt: row.created_at.toISOString()
  }));
}

export async function listMemories(userId: string, limit = 20): Promise<string[]> {
  if (!pool) return [];
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await pool.query(
    `SELECT content
     FROM memories
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, safeLimit]
  );
  return result.rows.map((row) => row.content);
}

export async function saveMemory(userId: string, content: string): Promise<void> {
  if (!pool) return;
  const trimmed = content.trim();
  if (!trimmed) return;
  await pool.query(
    "INSERT INTO memories (id, user_id, content) VALUES ($1, $2, $3)",
    [randomUUID(), userId, trimmed]
  );
}

export async function setProviderResponseId(
  conversationId: string,
  userId: string,
  responseId: string
): Promise<void> {
  if (!pool) return;
  await pool.query(
    "UPDATE conversations SET provider_response_id = $1 WHERE id = $2 AND user_id = $3",
    [responseId, conversationId, userId]
  );
}

export async function getProviderResponseId(
  conversationId: string,
  userId: string
): Promise<string | undefined> {
  if (!pool) return undefined;
  const result = await pool.query(
    "SELECT provider_response_id FROM conversations WHERE id = $1 AND user_id = $2",
    [conversationId, userId]
  );
  return result.rows[0]?.provider_response_id ?? undefined;
}
