export default function ReportsLayout({ children }: LayoutProps<'/reports'>) {
  return (
    <section>
      {/* app/reports/error.tsx does not wrap this layout, so this heading survives an error in the page. */}
      <h1>Reports</h1>
      {children}
    </section>
  );
}
