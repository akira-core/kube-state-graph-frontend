import type { JSX } from 'react';

import type { PodParentMode } from '../../../../shared/constants/types';

import type { LayoutModeControlProps } from './LayoutModeControl.types';

const OPTIONS: Array<{ label: string; value: PodParentMode }> = [
  { label: 'Node', value: 'node' },
  { label: 'Controller', value: 'controller' },
];

export function LayoutModeControl({ mode, onChange, action }: Readonly<LayoutModeControlProps>): JSX.Element {
  return (
    <div className="flex flex-col gap-1" data-testid="layout-mode-control">
      <div className="flex min-h-6 items-center justify-between">
        <span className="text-[11px] font-medium opacity-85">Layout</span>
        {action}
      </div>
      <div className="flex">
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="flex flex-1 items-center justify-center gap-1 text-xs">
            <input
              type="radio"
              name="pod-parent-mode"
              value={opt.value}
              checked={mode === opt.value}
              aria-label={opt.label}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
