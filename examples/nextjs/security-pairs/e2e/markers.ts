// Fake, non-secret markers. playwright.config.ts builds the app with them, and
// the env-leak tests search the shipped JavaScript for them.
export const LEAKED_MARKER = 'sk_test_DEMO_LEAKED_0000';
export const SERVER_ONLY_MARKER = 'sk_test_DEMO_SERVER_ONLY_0000';
