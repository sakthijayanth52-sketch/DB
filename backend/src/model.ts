import OpenAI from "openai";

export type ChatRequest = { message: string; conversationId?: string; previousResponseId?: string };
export type ModelResponse = { text: string; model: string; responseId?: string };
export interface ModelAdapter { chat(request: ChatRequest): Promise<ModelResponse>; }

export class OpenAIModel implements ModelAdapter {
  private readonly client: OpenAI;
  private readonly model: string;
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
  }
  async chat(request: ChatRequest): Promise<ModelResponse> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: "You are DB, a personal AI assistant. Be helpful, clear, honest, and concise. Never claim to have performed an action you did not perform.",
      input: request.message,
      ...(request.previousResponseId ? { previous_response_id: request.previousResponseId } : {})
    });
    return { text: response.output_text, model: response.model, responseId: response.id };
  }
}

export class MockModel implements ModelAdapter {
  async chat(request: ChatRequest): Promise<ModelResponse> {
    return { text: `DB received: ${request.message}`, model: "mock" };
  }
}
