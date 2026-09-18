export type ChatRequest = {
  message: string;
  conversationId?: string;
};

export type ModelResponse = {
  text: string;
  model: string;
};

export interface ModelAdapter {
  chat(request: ChatRequest): Promise<ModelResponse>;
}

export class MockModel implements ModelAdapter {
  async chat(request: ChatRequest): Promise<ModelResponse> {
    return {
      text: `DB received: ${request.message}`,
      model: "mock"
    };
  }
}
