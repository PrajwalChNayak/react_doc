'use client';

import { useState } from 'react';

// VULNERABLE. Any NEXT_PUBLIC_ variable is replaced with its literal value at
// build time, in every bundle that references it. This Client Component ships
// to the browser, so the "secret" key ships inside a public JavaScript chunk
// under /_next/static, readable by anyone who loads the page.
const PAYMENTS_KEY = process.env.NEXT_PUBLIC_PAYMENTS_SECRET_KEY;

export function PaymentsWidget() {
  const [status, setStatus] = useState('idle');

  async function startCheckout() {
    setStatus('pending');
    const response = await fetch('https://api.payments.example/v1/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYMENTS_KEY}` },
    }).catch(() => null);
    setStatus(response?.ok ? 'done' : 'failed');
  }

  return (
    <button type="button" onClick={startCheckout}>
      Pay now ({status})
    </button>
  );
}
