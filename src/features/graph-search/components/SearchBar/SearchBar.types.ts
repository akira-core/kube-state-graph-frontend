import type { SearchResult } from '../../types';

export interface SearchBarProps {
  // Controlled query string owned by KsgPanel (ephemeral useState — never panel options).
  query: string;
  onQueryChange: (query: string) => void;
  results: readonly SearchResult[];
  // Lit/fit node ids (proxy-hit substituted). Debounced fit and Enter-flush use this set.
  fitNodeIds: readonly string[];
  // Only read for `collapsedUnder` annotations — a view with no collapsed containers (the
  // Sankey-style views) omits it.
  labelById?: ReadonlyMap<string, string>;
  onLocate: (result: SearchResult) => void;
  // Imperative fit bridge from GraphCanvas (design D5). No-op-safe when null (cy not ready).
  onFitToIds: (ids: readonly string[]) => void;
  // `<prefix>-bar` / `<prefix>-input` test ids. Defaults to `graph-search`.
  testIdPrefix?: string;
  placeholder?: string;
  ariaLabel?: string;
}
