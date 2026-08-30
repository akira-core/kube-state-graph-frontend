export interface ChangeTimeCellProps {
  // Pre-formatted localized absolute time — the table computes it via formatChangeTime
  // (so this cell never calls dateTimeFormat). `undefined` → the cell renders a muted
  // "—" (missing / unparseable timestamp, or a non-ready lookup). Required (always
  // passed) and may be undefined, so callers can forward formatChangeTime's result
  // directly under exactOptionalPropertyTypes.
  formatted: string | undefined;
  // The raw ISO string, shown as the cell's `title` — only when `formatted` is present.
  title?: string;
  // data-testid for the cell so each column / section is addressable in tests
  // (e.g. `application-current`, `container-previous`).
  testId?: string;
}
