import 'server-only';

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Role } from './definitions';

// An in-memory user store so the example runs without a database. A real app
// reads these rows from its database, and only lib/dal.ts and the login
// action import this module.
type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionVersion: number;
  passwordSalt: string;
  passwordHash: string;
  internalNotes: string;
};

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

function makeUser(
  fields: Omit<UserRecord, 'passwordSalt' | 'passwordHash' | 'sessionVersion'>,
  password: string,
): UserRecord {
  const passwordSalt = randomBytes(16).toString('hex');
  return {
    ...fields,
    sessionVersion: 1,
    passwordSalt,
    passwordHash: hashPassword(password, passwordSalt),
  };
}

// Demo credentials, documented in README.md. Never ship hard-coded users.
const users: UserRecord[] = [
  makeUser(
    { id: 'u_1', email: 'ada@example.com', name: 'Ada', role: 'admin', internalNotes: 'Owner account.' },
    'admin-demo-password',
  ),
  makeUser(
    { id: 'u_2', email: 'grace@example.com', name: 'Grace', role: 'member', internalNotes: 'Trial ends soon.' },
    'member-demo-password',
  ),
];

export async function findUserById(id: string) {
  return users.find((user) => user.id === id) ?? null;
}

export async function listAllUsers() {
  return users;
}

export async function checkCredentials(email: string, password: string) {
  const user = users.find((candidate) => candidate.email === email.toLowerCase());
  // Hash even when the user does not exist, so the response time does not
  // reveal which email addresses have accounts.
  const salt = user?.passwordSalt ?? randomBytes(16).toString('hex');
  const attempted = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(user?.passwordHash ?? '00'.repeat(64), 'hex');
  const matches = timingSafeEqual(attempted, expected);
  return user && matches ? user : null;
}
