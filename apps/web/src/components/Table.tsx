import type { ReactNode } from 'react';

interface Column<Row> {
  key: string;
  header: string;
  /** Numeric columns are right-aligned and use tabular figures. */
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty?: string;
}

/** A plain, accessible data table (caption, scoped headers, tabular numbers). */
export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty = 'Nothing yet.',
}: TableProps<Row>) {
  return (
    // Focusable so keyboard users can scroll wide tables (axe: scrollable-region-focusable).
    <div tabIndex={0} className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-sunken">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-fg-muted ${c.numeric === true ? 'text-right' : ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-fg-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-line">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-2 ${c.numeric === true ? 'num text-right' : ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
