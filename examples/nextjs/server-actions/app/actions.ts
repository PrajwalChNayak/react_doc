'use server';

// Every export in this file becomes a POST endpoint that anyone can call with
// any arguments. Each action authenticates, validates and authorizes on its own.

import { refresh } from 'next/cache';
import { z } from 'zod';
import { endSession, getSessionUser, startSession } from '@/lib/session';
import { createTodo, findTodo, removeTodo } from '@/lib/todos';
import type { AddTodoState, DeleteTodoState } from './todo-types';

const signInSchema = z.object({
  userId: z.enum(['ada', 'grace', 'admin']),
});

export async function signIn(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return;

  // Setting a cookie in a Server Action re-renders the current page in the same
  // response, so the header switches to "Signed in as …" without refresh().
  await startSession(parsed.data.userId);
}

export async function signOut(): Promise<void> {
  await endSession();
}

const addTodoSchema = z.object({
  text: z
    .string({ error: 'Write something first.' })
    .trim()
    .min(1, { error: 'Write something first.' })
    .max(120, { error: 'Keep it under 120 characters.' }),
});

export async function addTodo(
  _previousState: AddTodoState,
  formData: FormData,
): Promise<AddTodoState> {
  const rawText = formData.get('text');
  const text = typeof rawText === 'string' ? rawText : '';

  // 1. Authenticate. The form is visible to signed-out visitors on purpose: the
  //    check that matters is this one, not what the UI chose to render.
  const user = await getSessionUser();
  if (!user) {
    return { status: 'error', message: 'Sign in to add todos.', fieldErrors: {}, text };
  }

  // 2. Validate. FormData is untrusted input.
  const parsed = addTodoSchema.safeParse({ text: rawText });
  if (!parsed.success) {
    return {
      status: 'error',
      message: null,
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      text,
    };
  }

  // 3. Mutate. Ownership comes from the session, never from the form.
  const result = await createTodo(parsed.data.text, user);
  if (!result.ok) {
    return { status: 'error', message: 'You already have a todo with that text.', fieldErrors: {}, text };
  }

  // 4. The store is not cached, so re-render the current route with fresh data.
  //    The new list arrives in this same response.
  refresh();
  return { status: 'success', message: null, fieldErrors: {}, text: '' };
}

const todoIdSchema = z.uuid();

export async function deleteTodo(
  todoId: string,
  _previousState: DeleteTodoState,
  _formData: FormData,
): Promise<DeleteTodoState> {
  // The id was bound on the client, so it is as untrusted as a form field.
  const user = await getSessionUser();
  if (!user) {
    return { error: 'Sign in to delete todos.' };
  }

  const id = todoIdSchema.safeParse(todoId);
  if (!id.success) {
    return { error: 'That todo no longer exists.' };
  }

  const todo = await findTodo(id.data);
  if (!todo) {
    return { error: 'That todo no longer exists.' };
  }

  // Authorize against this record: the owner or an admin.
  if (todo.ownerId !== user.id && user.role !== 'admin') {
    return { error: 'Only the owner or an admin can delete this todo.' };
  }

  await removeTodo(todo.id);
  refresh();
  return { error: null };
}
