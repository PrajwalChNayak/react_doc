import { PaymentsWidget } from './payments-widget';

export default function VulnerableEnvLeakPage() {
  return (
    <main>
      <h1>Checkout (vulnerable)</h1>
      <p>The payments key is inlined into this page&apos;s JavaScript.</p>
      <PaymentsWidget />
    </main>
  );
}
