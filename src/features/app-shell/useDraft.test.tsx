import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_GRAPH_FILTERS, type GraphFilters } from '../../shared/types/graphFilters';

import { useDraft } from './useDraft';

describe('useDraft', () => {
  it('seeds from applied on mount', () => {
    const applied: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop'] };
    const { result } = renderHook(() => useDraft(applied));
    expect(result.current.draft).toEqual(applied);
    expect(result.current.dirty).toBe(false);
  });

  it('toggles dirty on edit and after the applied value catches up', () => {
    const applied: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop'] };
    const { result, rerender } = renderHook(({ value }: { value: GraphFilters }) => useDraft(value), {
      initialProps: { value: applied },
    });
    act(() => {
      result.current.setDraft({ ...applied, namespace: ['shop', 'infra'] });
    });
    expect(result.current.dirty).toBe(true);
    const committed: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop', 'infra'] };
    rerender({ value: committed });
    expect(result.current.draft).toEqual(committed);
    expect(result.current.dirty).toBe(false);
  });

  it('re-seeds on an external applied change', () => {
    const applied: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop'] };
    const { result, rerender } = renderHook(({ value }: { value: GraphFilters }) => useDraft(value), {
      initialProps: { value: applied },
    });
    act(() => {
      result.current.setDraft({ ...applied, cluster: ['prod'] });
    });
    expect(result.current.dirty).toBe(true);
    const fromUrl: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, az: ['zone-a'] };
    rerender({ value: fromUrl });
    expect(result.current.draft).toEqual(fromUrl);
    expect(result.current.dirty).toBe(false);
  });
});
