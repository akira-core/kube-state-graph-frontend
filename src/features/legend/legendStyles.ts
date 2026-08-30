export const legendListClass = 'm-0 list-none p-0';
export const legendRowClass = 'flex items-center gap-2 py-0.5';
export const legendDimmedClass = 'opacity-40';
export const legendToggleClass = 'ml-auto';

export function legendListStyles(): { list: string; row: string } {
  return { list: legendListClass, row: legendRowClass };
}

export function legendToggleStyles(): { dimmed: string; toggle: string } {
  return { dimmed: legendDimmedClass, toggle: legendToggleClass };
}
