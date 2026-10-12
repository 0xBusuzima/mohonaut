import type { MDXComponents } from 'mdx/types';

/** Typography of the MDX docs (player guide, economy paper). */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (p) => <h1 className="font-display text-5xl font-black tracking-wide uppercase" {...p} />,
    h2: (p) => (
      <h2 className="mt-10 font-display text-3xl font-extrabold tracking-wide uppercase" {...p} />
    ),
    h3: (p) => <h3 className="mt-6 font-condensed text-xl font-semibold uppercase" {...p} />,
    p: (p) => <p className="mt-4 leading-relaxed" {...p} />,
    ul: (p) => <ul className="mt-4 list-disc space-y-1 pl-6" {...p} />,
    ol: (p) => <ol className="mt-4 list-decimal space-y-1 pl-6" {...p} />,
    a: (p) => <a className="text-data underline" {...p} />,
    code: (p) => <code className="num rounded bg-surface-sunken px-1" {...p} />,
    // Scrollable blocks must be reachable by keyboard (axe: scrollable-region-focusable).
    pre: (p) => (
      <pre
        tabIndex={0}
        className="num mt-4 overflow-x-auto rounded-lg bg-surface-sunken p-4 text-sm"
        {...p}
      />
    ),
    table: (p) => (
      <div tabIndex={0} className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left" {...p} />
      </div>
    ),
    th: (p) => (
      <th
        className="border-b border-line px-3 py-2 font-condensed text-sm uppercase text-fg-muted"
        {...p}
      />
    ),
    td: (p) => <td className="border-b border-line px-3 py-2" {...p} />,
    ...components,
  };
}
