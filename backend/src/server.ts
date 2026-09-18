import "dotenv/config";
import cors from "cors";
import express from "express";
import { ModelAdapter, MockModel } from "./model.js";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const model: ModelAdapter = new MockModel();

app.use(cors({ origin: process.env.DB_CORS_ORIGIN ?? "*" }));
app.use(express.json());

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
  } catch {
    return res.status(500).json({ error: "DB model request failed" });
  }
});

app.listen(port, () =>
  console.log("DB backend listening on port " + port)
);
