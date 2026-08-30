import { useCallback, useState } from 'react';

import type { PodParentMode } from '../../../shared/constants/types';

export interface UseLayoutRunTokenInput {
  // Collapsed parent-container ids. A fold/unfold is APPLIED (diff-patch) but must
  // NOT relayout — the extension preserves positions.
  collapsedIds?: Set<string> | undefined;
  // Switching mode re-parents pods + adds/removes edges (structural), so it DOES relayout.
  podParentMode?: PodParentMode | undefined;
}

export interface LayoutRunTokens {
  // Bumps on collapsed-set CONTENT change; gates diff-patch/re-collapse. Decoupled
  // from layoutToken so fold/unfold does not relayout.
  collapseApplyToken: number;
  // Bumps on a pod-parent-mode flip OR requestRelayout(); gates the single cy.layout()
  // source (useGraphLayout). NOT bumped by a collapse toggle — the point of the split.
  layoutToken: number;
  // One-shot relayout for graph changes that touch neither collapsed-set content nor
  // mode: mount-time default-collapse and a refresh adding a new unanchorable family.
  // Stable identity — safe in effect deps.
  requestRelayout: () => void;
}

interface Counter {
  key: string;
  token: number;
}

// Layout key: only the pod-parent mode (fold/unfold must not relayout).
function layoutKeyOf({ podParentMode }: UseLayoutRunTokenInput): string {
  return podParentMode ?? 'node';
}

// Apply key: the collapsed-set content (drives diff-patch).
function applyKeyOf({ collapsedIds }: UseLayoutRunTokenInput): string {
  return collapsedIds === undefined ? '' : [...collapsedIds].sort().join('|');
}

// Two independent monotonic counters; see LayoutRunTokens above for what each gates.
// React render-phase setState idiom: setState during render is permitted and re-renders
// once with the updated state. Each counter is seeded from the first render so mount
// yields token 0 (mount-only layout) with no spurious bump.
export function useLayoutRunToken(input: UseLayoutRunTokenInput): LayoutRunTokens {
  const layoutKey = layoutKeyOf(input);
  const applyKey = applyKeyOf(input);
  const [layout, setLayout] = useState<Counter>(() => ({ key: layoutKey, token: 0 }));
  const [apply, setApply] = useState<Counter>(() => ({ key: applyKey, token: 0 }));

  const requestRelayout = useCallback(() => {
    setLayout((s) => ({ key: s.key, token: s.token + 1 }));
  }, []);

  let layoutToken = layout.token;
  if (layoutKey !== layout.key) {
    layoutToken = layout.token + 1;
    setLayout({ key: layoutKey, token: layoutToken });
  }
  let collapseApplyToken = apply.token;
  if (applyKey !== apply.key) {
    collapseApplyToken = apply.token + 1;
    setApply({ key: applyKey, token: collapseApplyToken });
  }
  return { collapseApplyToken, layoutToken, requestRelayout };
}
