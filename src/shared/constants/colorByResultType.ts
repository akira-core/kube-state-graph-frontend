// Single source of truth for the KNOWN code-change `result_type` colours, shown in the
// Containers table's "Change Type" column (node-detail panel). Mirrors colorBySeverity's
// shape (map + fallback + lookup). These render as COLOURED TEXT (not a badge
// background). Hardcoded hex (not theme-semantic) to match the panel's STATUS_COLOR /
// SEVERITY_COLOR product decision — one theme-independent palette, the same family the
// legend and status borders draw from.
export const RESULT_TYPES = ['UNCHANGED', 'UPDATED', 'REPLACED', 'ADDED', 'REMOVED', 'RENAMED', 'REVERTED'] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

export const RESULT_TYPE_COLOR: Record<ResultType, string> = {
  UNCHANGED: '#8E8E8E', // grey (muted — nothing changed)
  UPDATED: '#3274D9', // blue
  REPLACED: '#FF9830', // orange
  ADDED: '#73BF69', // green (same green as STATUS_COLOR.normal)
  REMOVED: '#E02F44', // red (same red as SEVERITY_COLOR.critical)
  RENAMED: '#B877D9', // purple
  REVERTED: '#F2CC0C', // yellow (same yellow as SEVERITY_COLOR.warning)
};

// Unknown result_type (not one of the known enum values): a NEUTRAL grey. The value
// still RENDERS (visible-by-default, so an upstream enum addition is never silently
// dropped) but carries no semantic colour. Distinct from colorBySeverity's fail-LOUD
// fallback: an unrecognised change type is not "most severe", just uncategorised.
export const FALLBACK_RESULT_TYPE_COLOR = RESULT_TYPE_COLOR.UNCHANGED;

// Text colour for any result_type string: a known tier's colour, else the neutral
// fallback. Case-insensitive (normalises to upper-case before lookup, so backend casing
// drift still maps to the right colour). Never throws, never blank.
export function resultTypeColor(type: string): string {
  return (RESULT_TYPE_COLOR as Record<string, string>)[type.toUpperCase()] ?? FALLBACK_RESULT_TYPE_COLOR;
}
