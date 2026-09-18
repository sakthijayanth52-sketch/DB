import { randomUUID } from "node:crypto";

export type StoredMessage = {
  id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const messages = new Map<string, StoredMessage[]>();

export function saveMessage(
  conversationId: string,
  userId: string,
  role: StoredMessage["role"],
  content: string
): StoredMessage {
  const message: StoredMessage = {
    id: randomUUID(),
    conversationId,
    userId,
    role,
    content,
    createdAt: new Date().toISOString()
  };
  const list = messages.get(conversationId) ?? [];
  list.push(message);
  messages.set(conversationId, list);
  return message;
}

export function getMessages(conversationId: string, userId: string): StoredMessage[] {
  return (messages.get(conversationId) ?? []).filter((m) => m.userId === userId);
}
