'use client';

import { useActionState, useOptimistic } from 'react';
import { addTodo } from './actions';
import { DeleteTodoButton } from './delete-todo-button';
import type { AddTodoState, TodoView } from './todo-types';

type ListedTodo = TodoView & { pending: boolean };

const initialAddState: AddTodoState = {
  status: 'idle',
  message: null,
  fieldErrors: {},
  text: '',
};

export function Todos({ todos, viewerName }: { todos: TodoView[]; viewerName: string | null }) {
  // The server-rendered list is the source of truth. The optimistic overlay
  // exists only while the add action is pending. When refresh() in the action
  // delivers the new list, the overlay is dropped in the same render. When the
  // action returns an error instead, the overlay is dropped and nothing replaces
  // it: that is the rollback.
  const [optimisticTodos, addOptimisticTodo] = useOptimistic<ListedTodo[], ListedTodo>(
    todos.map((todo) => ({ ...todo, pending: false })),
    (current, pendingTodo) => [pendingTodo, ...current],
  );

  // This wrapper is a client function, so this form needs JavaScript. The
  // sign-in and delete forms pass Server Actions directly and work without it.
  const [state, formAction, isPending] = useActionState(
    async (previousState: AddTodoState, formData: FormData) => {
      const text = String(formData.get('text') ?? '').trim();
      if (viewerName && text.length > 0 && text.length <= 120) {
        addOptimisticTodo({
          id: `pending-${crypto.randomUUID()}`,
          text,
          ownerName: viewerName,
          isMine: true,
          pending: true,
        });
      }
      return addTodo(previousState, formData);
    },
    initialAddState,
  );

  const textErrors = state.fieldErrors.text ?? [];

  return (
    <section aria-labelledby="todos-heading">
      <h2 id="todos-heading">Todos</h2>

      <form action={formAction} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="todo-text" style={{ display: 'block' }}>
            New todo
          </label>
          <input
            id="todo-text"
            name="text"
            defaultValue={state.text}
            aria-invalid={textErrors.length > 0}
            aria-describedby="todo-text-error"
            style={{ width: '100%' }}
          />
          <p id="todo-text-error" role="alert" style={{ color: '#b91c1c', margin: '4px 0 0' }}>
            {textErrors.join(' ') || state.message}
          </p>
        </div>
        <button type="submit" disabled={isPending} style={{ marginTop: 20 }}>
          {isPending ? 'Adding…' : 'Add'}
        </button>
      </form>
      <noscript>
        <p>Adding a todo uses useOptimistic, so it needs JavaScript. Signing in and deleting work without it.</p>
      </noscript>

      <ul style={{ padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {optimisticTodos.map((todo) => (
          <li
            key={todo.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              padding: 8,
              border: '1px solid #d4d4d8',
              opacity: todo.pending ? 0.5 : 1,
            }}
          >
            <span>
              {todo.text}{' '}
              <small>
                by {todo.isMine ? 'you' : todo.ownerName}
                {todo.pending ? ' (saving…)' : ''}
              </small>
            </span>
            {/* Shown on every saved todo, even ones you do not own, so you can
                watch the server refuse the request. */}
            {todo.pending ? null : <DeleteTodoButton todoId={todo.id} label={todo.text} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
