/** `1 pod` / `3 pods`; pass `plural` when it is not `${singular}s` (`1 PVC` / `2 PVCs` is). */
export function countWord(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
