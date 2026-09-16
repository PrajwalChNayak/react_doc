'use client';

import { useActionState } from 'react';
import { initialFormState, type FormState } from '@/lib/validation';

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
};

// A Client Component only because it shows pending and error state. It never
// touches the database: it calls a Server Action that does.
export function EntryForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, initialFormState);

  return (
    <form action={formAction}>
      <p>
        <label htmlFor="name">Name</label>
        <br />
        <input id="name" name="name" maxLength={80} required />
        {state.fieldErrors.name?.map((error) => (
          <span key={error} role="alert">
            {' '}
            {error}
          </span>
        ))}
      </p>
      <p>
        <label htmlFor="message">Message</label>
        <br />
        <textarea id="message" name="message" maxLength={500} rows={3} required />
        {state.fieldErrors.message?.map((error) => (
          <span key={error} role="alert">
            {' '}
            {error}
          </span>
        ))}
      </p>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Sign the guestbook'}
      </button>
      {state.message ? <p aria-live="polite">{state.message}</p> : null}
    </form>
  );
}
