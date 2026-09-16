// Shapes shared by the Server Actions and the Client Components. A "use server"
// file should export only async functions, so the types live here.

export type TodoView = {
  id: string;
  text: string;
  ownerName: string;
  isMine: boolean;
};

export type AddTodoState = {
  status: 'idle' | 'success' | 'error';
  message: string | null;
  fieldErrors: { text?: string[] };
  // Echoed back on a validation error so the input keeps what the user typed.
  text: string;
};

export type DeleteTodoState = {
  error: string | null;
};
