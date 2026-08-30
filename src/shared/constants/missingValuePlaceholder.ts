// Single source of truth for the "value absent" placeholder shown in detail-panel
// table cells that have a row but no value (Change Report Current/Previous time,
// Containers Change Type, Alerts Pod/Service). Rendered muted (not error-red) — it
// reads as "no value". Replaces the per-file em-dash literals so the panel never mixes
// "—" and "n/a".
export const MISSING_VALUE_PLACEHOLDER = 'n/a';
