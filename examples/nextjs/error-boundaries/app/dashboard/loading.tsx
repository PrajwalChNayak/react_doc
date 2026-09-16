export default function DashboardLoading() {
  // Sized like the real page, so nothing jumps when the content swaps in.
  return (
    <main aria-busy="true">
      <h1>Dashboard</h1>
      <div style={{ height: 96, borderRadius: 8, background: '#e5e7eb' }} />
    </main>
  );
}
