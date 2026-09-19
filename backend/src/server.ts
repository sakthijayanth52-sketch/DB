import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import {
  ModelAdapter,
  MockModel,
  OpenAIModel
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
  saveMemory
} from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const DB_API_KEY = process.env.DB_API_KEY ?? "";
const REQUIRE_AUTH = (process.env.DB_REQUIRE_AUTH ?? "true").toLowerCase() === "true";
const OWNER_ID = process.env.DB_OWNER_ID ?? "owner";
const MAX_MESSAGE_LENGTH = 20_000;
const RATE_LIMIT = 60;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for permanent DB storage");
}

function createModel(): ModelAdapter {
  const provider = (process.env.MODEL_PROVIDER ?? "mock").toLowerCase();
  if (provider === "openai") return new OpenAIModel();
  if (provider === "mock") return new MockModel();
  throw new Error(`Unsupported MODEL_PROVIDER: ${provider}`);
}

const model = createModel();

if (REQUIRE_AUTH && !DB_API_KEY) {
  throw new Error("DB_API_KEY is required when DB_REQUIRE_AUTH=true");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.DB_CORS_ORIGIN ?? "http://localhost" }));
app.use(express.json({ limit: "256kb" }));

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function constantTimeEquals(aValue: string, bValue: string): boolean {
  const a = Buffer.from(aValue);
  const b = Buffer.from(bValue);
  return a.length === b.length && timingSafeEqual(a, b);
}

app.use("/v1", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (REQUIRE_AUTH) {
    const supplied = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!constantTimeEquals(supplied, DB_API_KEY)) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

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
    version: "0.2.1",
    persistentStorage: true,
    modelProvider: process.env.MODEL_PROVIDER ?? "mock",
    authenticationRequired: REQUIRE_AUTH
  })
);

app.post("/v1/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "message is required" });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(413).json({ error: "message is too long" });
  }

  try {
    let conversationId =
      typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined;

    if (conversationId && !(await conversationExists(conversationId, OWNER_ID))) {
      return res.status(404).json({ error: "conversation not found" });
    }

    if (!conversationId) conversationId = await createConversation(OWNER_ID);

    const previousResponseId = await getProviderResponseId(conversationId, OWNER_ID);
    await saveMessage(conversationId, OWNER_ID, "user", message);

    const rememberMatch = message.match(/^remember(?: this| that)?[:\s]+(.+)$/i);
    if (rememberMatch?.[1] && rememberMatch[1].trim().length <= 1000) {
      await saveMemory(OWNER_ID, rememberMatch[1].trim());
    }

    const history = await listMessages(conversationId, OWNER_ID, 40);
    const memories = await listMemories(OWNER_ID, 20);

    const result = await model.chat({
      message,
      conversationId,
      previousResponseId,
      history,
      memories
    });

    await saveMessage(conversationId, OWNER_ID, "assistant", result.text);

    if (result.responseId) {
      await setProviderResponseId(conversationId, OWNER_ID, result.responseId);
    }

    return res.json({ ...result, conversationId });
  } catch (error) {
    console.error("DB model request failed", error);
    return res.status(500).json({ error: "DB model request failed" });
  }
});

app.get("/v1/conversations/:conversationId/messages", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    if (!(await conversationExists(conversationId, OWNER_ID))) {
      return res.status(404).json({ error: "conversation not found" });
    }
    return res.json({ messages: await listMessages(conversationId, OWNER_ID, 200) });
  } catch (error) {
    console.error("DB history request failed", error);
    return res.status(500).json({ error: "DB history request failed" });
  }
});

ensureSchema()
  .then(() => {
    app.listen(port, () => console.log("DB backend listening on port " + port));
  })
  .catch((error) => {
    console.error("DB startup failed", error);
    process.exit(1);
  });
