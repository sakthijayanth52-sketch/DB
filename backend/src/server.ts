import "dotenv/config";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  ModelAdapter,
  MockModel,
  OpenAIModel,
  OllamaModel
} from "./model.js";
import {
  ensureSchema,
  createConversation,
  conversationExists,
  saveMessage,
  setProviderResponseId,
  getProviderResponseId,
  listMessages,
  listMemories,
  saveMemory,
  createUser,
  findUserByEmail,
  createSession,
  getUserIdBySession,
  deleteSession,
  deleteExpiredSessions
} from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const MAX_MESSAGE_LENGTH = 20_000;
const RATE_LIMIT = 60;
const SESSION_DAYS = 30;
const scrypt = promisify(scryptCallback);

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for permanent DB storage");
}

function createModel(): ModelAdapter {
  const provider = (process.env.MODEL_PROVIDER ?? "mock").toLowerCase();
  if (provider === "openai") return new OpenAIModel();
  if (provider === "ollama") return new OllamaModel();
  if (provider === "mock") return new MockModel();
  throw new Error(`Unsupported MODEL_PROVIDER: ${provider}`);
}

const model = createModel();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.DB_CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "256kb" }));

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function issueSession() {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}

async function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return res.status(401).json({ error: "authentication required" });
  const userId = await getUserIdBySession(hashToken(token));
  if (!userId) return res.status(401).json({ error: "invalid or expired session" });
  req.userId = userId;
  return next();
}

app.use("/v1", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");

  const key = req.ip ?? "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) {
      return res.status(429).json({ error: "rate limit exceeded" });
    }
  }

  if (rateBuckets.size > 10_000) {
    for (const [ip, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(ip);
    }
  }

  return next();
});

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "db-backend",
    version: "0.3.0",
    persistentStorage: true,
    modelProvider: process.env.MODEL_PROVIDER ?? "mock",
    authenticationRequired: true
  })
);

app.post("/v1/auth/register", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "valid email is required" });
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: "password must be 8-200 characters" });
  }

  try {
    if (await findUserByEmail(email)) return res.status(409).json({ error: "email already registered" });
    const userId = randomUUID();
    await createUser(userId, email, await hashPassword(password));
    const session = issueSession();
    await createSession(randomUUID(), userId, session.tokenHash, session.expiresAt);
    return res.status(201).json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  } catch (error) {
    console.error("DB registration failed", error);
    return res.status(500).json({ error: "registration failed" });
  }
});

app.post("/v1/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  try {
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "invalid email or password" });
    }
    const session = issueSession();
    await createSession(randomUUID(), user.id, session.tokenHash, session.expiresAt);
    return res.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  } catch (error) {
    console.error("DB login failed", error);
    return res.status(500).json({ error: "login failed" });
  }
});

app.post("/v1/auth/logout", requireSession, async (req, res) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  await deleteSession(hashToken(token));
  return res.status(204).send();
});

app.use("/v1", (req, res, next) => {
  if (req.path === "/auth/register" || req.path === "/auth/login") return next();
  return requireSession(req, res, next);
});

app.post("/v1/chat", async (req, res) => {
  const userId = req.userId!;
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "message is required" });
  if (message.length > MAX_MESSAGE_LENGTH) return res.status(413).json({ error: "message is too long" });

  try {
    let conversationId =
      typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined;

    if (conversationId && !(await conversationExists(conversationId, userId))) {
      return res.status(404).json({ error: "conversation not found" });
    }

    if (!conversationId) conversationId = await createConversation(userId);

    const previousResponseId = await getProviderResponseId(conversationId, userId);
    await saveMessage(conversationId, userId, "user", message);

    const rememberMatch = message.match(/^remember(?: this| that)?[:\s]+(.+)$/i);
    if (rememberMatch?.[1] && rememberMatch[1].trim().length <= 1000) {
      await saveMemory(userId, rememberMatch[1].trim());
    }

    const history = await listMessages(conversationId, userId, 40);
    const memories = await listMemories(userId, 20);
    const result = await model.chat({ message, conversationId, previousResponseId, history, memories });

    await saveMessage(conversationId, userId, "assistant", result.text);
    if (result.responseId) await setProviderResponseId(conversationId, userId, result.responseId);

    return res.json({ ...result, conversationId });
  } catch (error) {
    console.error("DB model request failed", error);
    return res.status(500).json({ error: "DB model request failed" });
  }
});

app.get("/v1/conversations/:conversationId/messages", async (req, res) => {
  const userId = req.userId!;
  try {
    const conversationId = req.params.conversationId;
    if (!(await conversationExists(conversationId, userId))) {
      return res.status(404).json({ error: "conversation not found" });
    }
    return res.json({ messages: await listMessages(conversationId, userId, 200) });
  } catch (error) {
    console.error("DB history request failed", error);
    return res.status(500).json({ error: "DB history request failed" });
  }
});

ensureSchema()
  .then(async () => {
    await deleteExpiredSessions();
    app.listen(port, () => console.log("DB backend listening on port " + port));
  })
  .catch((error) => {
    console.error("DB startup failed", error);
    process.exit(1);
  });
