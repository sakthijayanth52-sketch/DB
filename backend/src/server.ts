import "dotenv/config";
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";

const app = express();
const port = Number(process.env.PORT ?? 8080);
app.use(cors({ origin: process.env.DB_CORS_ORIGIN ?? "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "db-backend", version: "0.1.0" }));

app.post("/v1/chat", (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "message is required" });
  return res.json({ id: randomUUID(), message: "DB received your message. Model adapter connection is the next build step.", model: process.env.MODEL_PROVIDER ?? "mock" });
});

app.listen(port, () => console.log("DB backend listening on port " + port));
