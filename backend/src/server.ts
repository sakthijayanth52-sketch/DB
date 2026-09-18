import "dotenv/config";
import cors from "cors";
import express from "express";
import { ModelAdapter, MockModel, OpenAIModel } from "./model.js";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const DB_API_KEY = process.env.DB_API_KEY;

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
  const supplied = req.header("authorization")?.replace(/^Bearer\\s+/i, "");
  if (supplied !== DB_API_KEY) return res.status(401).json({ error: "unauthorized" });
  return next();
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "db-backend", version: "0.1.0" })
);

app.post("/v1/chat", async (req, res) => {
  const message =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const result = await model.chat({
      message,
      conversationId:
        typeof req.body?.conversationId === "string"
          ? req.body.conversationId
          : undefined
    });

    return res.json(result);
  } catch (error) {
    console.error("DB model request failed", error);
    return res.status(500).json({ error: "DB model request failed" });
  }
});

app.listen(port, () =>
  console.log("DB backend listening on port " + port)
);
