export interface ChangeTypeCellProps {
  // The code-change `result_type` (raw backend string) off a ready lookup, or undefined
  // when absent / non-ready. `undefined` or empty string → the cell renders a muted "—"
  // (matching ChangeTimeCell's "no value" treatment); present → the raw value rendered
  // as coloured text (resultTypeColor: known enum → its semantic colour, unknown →
  // neutral grey, still shown so upstream enum additions never silently disappear).
  type: string | undefined;
  // data-testid for the cell so the column is addressable in tests (e.g. "container-type").
  testId?: string;
}
