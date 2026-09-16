'use client';

import { useActionState } from 'react';
import { deleteTodo } from './actions';
import type { DeleteTodoState } from './todo-types';

const initialDeleteState: DeleteTodoState = { error: null };

export function DeleteTodoButton({ todoId, label }: { todoId: string; label: string }) {
  // bind() on a Server Action keeps it a Server Action, so this form still
  // posts to the server when JavaScript is disabled.
  const [state, formAction, isPending] = useActionState(
    deleteTodo.bind(null, todoId),
    initialDeleteState,
  );

  return (
    <form action={formAction} style={{ textAlign: 'right' }}>
      <button type="submit" disabled={isPending} aria-label={`Delete "${label}"`}>
        {isPending ? 'Deleting…' : 'Delete'}
      </button>
      {state.error ? (
        <p role="alert" style={{ color: '#b91c1c', margin: '4px 0 0' }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
