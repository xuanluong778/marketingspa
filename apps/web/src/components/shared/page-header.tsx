export function PageHeader({
  title,
  description,
  children,
  titleClassName,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1
          className={
            titleClassName ??
            'text-2xl font-bold tracking-tight text-[hsl(var(--heading))] break-words'
          }
        >
          {title}
        </h1>
        {description && <p className="text-sm text-white/75 mt-1 break-words">{description}</p>}
      </div>
      {children ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
