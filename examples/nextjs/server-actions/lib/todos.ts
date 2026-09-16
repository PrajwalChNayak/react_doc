import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SessionUser } from './session';

// An in-memory store. It lives on globalThis so that every route bundle and
// every hot reload in `next dev` sees the same Map. Data resets when the server
// restarts, and it is not shared between server instances.

export type TodoRecord = {
  id: string;
  text: string;
  ownerId: string;
  ownerName: string;
  createdAt: number;
};

const globalForTodos = globalThis as typeof globalThis & {
  demoTodos?: Map<string, TodoRecord>;
};

function seed(): Map<string, TodoRecord> {
  const now = Date.now();
  const records: TodoRecord[] = [
    { id: randomUUID(), text: 'Read the Server Actions page', ownerId: 'ada', ownerName: 'Ada', createdAt: now - 2000 },
    { id: randomUUID(), text: 'Try deleting a todo you do not own', ownerId: 'grace', ownerName: 'Grace', createdAt: now - 1000 },
  ];
  return new Map(records.map((record) => [record.id, record]));
}

const todos = (globalForTodos.demoTodos ??= seed());

// Simulated latency, so the optimistic todo is visible for a moment.
const WRITE_DELAY_MS = 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function listTodos(): Promise<TodoRecord[]> {
  return [...todos.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function findTodo(id: string): Promise<TodoRecord | null> {
  return todos.get(id) ?? null;
}

export type CreateTodoResult =
  | { ok: true; todo: TodoRecord }
  | { ok: false; reason: 'duplicate' };

export async function createTodo(text: string, owner: SessionUser): Promise<CreateTodoResult> {
  await wait(WRITE_DELAY_MS);

  // A business rule that can only be checked on the server, after the delay.
  // Adding the same text twice shows the optimistic todo rolling back.
  const duplicate = [...todos.values()].some(
    (todo) => todo.ownerId === owner.id && todo.text.toLowerCase() === text.toLowerCase(),
  );
  if (duplicate) return { ok: false, reason: 'duplicate' };

  const record: TodoRecord = {
    id: randomUUID(),
    text,
    ownerId: owner.id,
    ownerName: owner.name,
    createdAt: Date.now(),
  };
  todos.set(record.id, record);
  return { ok: true, todo: record };
}

export async function removeTodo(id: string): Promise<void> {
  await wait(WRITE_DELAY_MS / 2);
  todos.delete(id);
}
