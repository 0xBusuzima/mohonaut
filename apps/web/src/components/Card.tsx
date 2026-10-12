import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  /** Small label above the title (stencilled, like a tank plate). */
  label?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, label, actions, children, className = '' }: CardProps) {
  return (
    <section className={`rounded-lg border border-line bg-surface-raised p-5 ${className}`}>
      {(title !== undefined || label !== undefined || actions !== undefined) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {label !== undefined && (
              <p className="font-stencil text-xs tracking-widest text-fg-muted uppercase">
                {label}
              </p>
            )}
            {title !== undefined && (
              <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">
                {title}
              </h2>
            )}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
