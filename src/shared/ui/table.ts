/**
 * The detail panel's tables.
 *
 * Column headers are the same small-caps eyebrow used for every group label in the app,
 * so a table header never outranks the section it sits under; the rows are separated by
 * hairlines rather than boxed, because these tables live inside an already-bordered panel.
 * Written as descendant variants so each table only has to name one class.
 */
export const dataTableClass = [
  'w-full border-collapse text-left text-[12px]',
  '[&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-hairline [&_th]:pb-1.5 [&_th]:pr-4',
  '[&_th]:text-[10px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-eyebrow [&_th]:text-muted',
  '[&_td]:border-b [&_td]:border-hairline [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top',
  '[&_tbody_tr:last-child>td]:border-b-0',
  '[&_th:last-child]:pr-0 [&_td:last-child]:pr-0',
].join(' ');
