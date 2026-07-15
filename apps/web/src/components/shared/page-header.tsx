export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--heading))]">{title}</h1>
        {description && <p className="text-sm text-white/75 mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}
