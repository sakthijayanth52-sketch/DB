import OpenAI from "openai";
import type { StoredMessage } from "./db.js";

export type ChatRequest = {
  message: string;
  conversationId?: string;
  previousResponseId?: string;
  history?: StoredMessage[];
  memories?: string[];
};

export type ModelResponse = {
  text: string;
  model: string;
  responseId?: string;
};

export interface ModelAdapter {
  chat(request: ChatRequest): Promise<ModelResponse>;
}

export class OpenAIModel implements ModelAdapter {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? "gpt-5.6-sol";
  }

  async chat(request: ChatRequest): Promise<ModelResponse> {
    const history = (request.history ?? []).slice(-30);
    const memories = (request.memories ?? []).slice(-20);

    const context = [
      "You are DB, a personal AI assistant owned and directed by its user.",
      "Be helpful, accurate, clear, and honest. Never claim to have performed an action you did not perform.",
      "Use the conversation history and durable memories as context, but do not expose internal implementation details unless asked.",
      memories.length
        ? "Durable memories:\n" + memories.map((m) => "- " + m).join("\n")
        : "Durable memories: none.",
      history.length
        ? "Recent conversation:\n" + history.map((m) => (m.role === "user" ? "User: " : "DB: ") + m.content).join("\n")
        : "Recent conversation: none."
    ].join("\n\n");

    const response = await this.client.responses.create({
      model: this.model,
      instructions: context,
      input: request.message,
      ...(request.previousResponseId ? { previous_response_id: request.previousResponseId } : {})
    });

    return {
      text: response.output_text,
      model: response.model,
      responseId: response.id
    };
  }
}

export class MockModel implements ModelAdapter {
  async chat(request: ChatRequest): Promise<ModelResponse> {
    return { text: `DB received: ${request.message}`, model: "mock" };
  }
}
