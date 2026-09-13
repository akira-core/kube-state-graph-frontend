import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Page-local draft of an applied selection. Seeds from `applied` on mount and re-seeds
 * when the URL changes without this page having just committed (Back / Forward).
 */
export function useDraft<T>(applied: T): {
  draft: T;
  setDraft: Dispatch<SetStateAction<T>>;
  dirty: boolean;
} {
  const [draft, setDraft] = useState<T>(applied);
  const prevApplied = useRef(applied);

  useEffect(() => {
    if (deepEqual(prevApplied.current, applied)) {
      return;
    }
    prevApplied.current = applied;
    setDraft(applied);
  }, [applied]);

  return { draft, setDraft, dirty: !deepEqual(draft, applied) };
}
