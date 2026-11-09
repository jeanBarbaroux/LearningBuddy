export function PageHeader({ title }: { readonly title: string }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <div className="accent-bar" />
    </header>
  );
}