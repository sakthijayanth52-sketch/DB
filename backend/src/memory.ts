export type Memory = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
};

const memories = new Map<string, Memory[]>();

export function addMemory(userId: string, content: string): Memory {
  const memory: Memory = {
    id: crypto.randomUUID(),
    userId,
    content,
    createdAt: new Date().toISOString()
  };
  const list = memories.get(userId) ?? [];
  list.push(memory);
  memories.set(userId, list);
  return memory;
}

export function getMemories(userId: string): Memory[] {
  return memories.get(userId) ?? [];
}
