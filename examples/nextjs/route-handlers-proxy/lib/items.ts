import 'server-only';
import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(0).max(10_000),
});

export const updateItemSchema = createItemSchema.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  { error: 'Send at least one field to update.' },
);

export type Item = z.infer<typeof createItemSchema> & {
  id: string;
  createdAt: string;
};

// In-memory data, kept on globalThis so every route bundle in the dev server
// and every hot reload sees the same Map. A real app uses a database: this
// Map is per process and is lost on restart.
const globalForItems = globalThis as typeof globalThis & {
  __items?: Map<string, Item>;
};

const items =
  globalForItems.__items ??
  new Map<string, Item>([
    ['itm_1', { id: 'itm_1', name: 'Keyboard', quantity: 12, createdAt: '2026-09-01T09:00:00.000Z' }],
    ['itm_2', { id: 'itm_2', name: 'Monitor', quantity: 4, createdAt: '2026-09-02T09:00:00.000Z' }],
  ]);
globalForItems.__items = items;

export function listItems(limit: number): Item[] {
  return [...items.values()].slice(0, limit);
}

export function getItem(id: string): Item | undefined {
  return items.get(id);
}

export function createItem(input: z.infer<typeof createItemSchema>): Item {
  const item: Item = {
    id: `itm_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  items.set(item.id, item);
  return item;
}

export function updateItem(id: string, patch: z.infer<typeof updateItemSchema>): Item | undefined {
  const existing = items.get(id);
  if (!existing) return undefined;
  const updated: Item = { ...existing, ...patch };
  items.set(id, updated);
  return updated;
}

export function deleteItem(id: string): boolean {
  return items.delete(id);
}
