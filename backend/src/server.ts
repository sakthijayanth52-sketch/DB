import "dotenv/config";
import cors from "cors";
import express from "express";
import { ModelAdapter, MockModel, OpenAIModel } from "./model.js";
import { ensureSchema, createConversation, conversationExists, saveMessage, setProviderResponseId, getProviderResponseId } from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const DB_API_KEY = process.env.DB_API_KEY;
const OWNER_ID = process.env.DB_OWNER_ID ?? "owner";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for permanent DB storage");

function createModel(): ModelAdapter {
  const provider = (process.env.MODEL_PROVIDER ?? "mock").toLowerCase();
  if (provider === "openai") return new OpenAIModel();
  if (provider === "mock") return new MockModel();
  throw new Error(`Unsupported MODEL_PROVIDER: ${provider}`);
}
const model = createModel();

app.use(cors({ origin: process.env.DB_CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "1mb" }));
app.use("/v1", (req, res, next) => {
  if (!DB_API_KEY) return next();
  const supplied = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (supplied !== DB_API_KEY) return res.status(401).json({ error: "unauthorized" });
  return next();
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "db-backend", version: "0.1.0", persistentStorage: Boolean(process.env.DATABASE_URL) })
);

app.post("/v1/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "message is required" });
  try {
    let conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined;
    if (conversationId && !(await conversationExists(conversationId, OWNER_ID))) return res.status(404).json({ error: "conversation not found" });
    if (!conversationId) conversationId = await createConversation(OWNER_ID);
    const previousResponseId = await getProviderResponseId(conversationId, OWNER_ID);
    await saveMessage(conversationId, OWNER_ID, "user", message);
    const result = await model.chat({ message, conversationId, previousResponseId });
    await saveMessage(conversationId, OWNER_ID, "assistant", result.text);
    if (result.responseId) await setProviderResponseId(conversationId, OWNER_ID, result.responseId);
    return res.json({ ...result, conversationId });
  } catch (error) {
    console.error("DB model request failed", error);
    return res.status(500).json({ error: "DB model request failed" });
  }
});

ensureSchema().then(() => {
  app.listen(port, () => console.log("DB backend listening on port " + port));
}).catch((error) => {
  console.error("DB startup failed", error);
  process.exit(1);
});
