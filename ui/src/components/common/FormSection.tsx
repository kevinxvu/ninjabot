import type { ReactNode } from 'react';

/** Titled group of form fields with an icon and divider. */
export function FormSection({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2 border-b pb-2 text-muted-foreground [&_svg]:size-4">
        {icon}
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
      </div>
      {children}
    </section>
  );
}
