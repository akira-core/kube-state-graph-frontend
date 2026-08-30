import type { JSX } from 'react';

import type { PodParentMode } from '../../../../shared/constants/types';
import { RailGroup, subEyebrowClass } from '../../../../shared/ui/Section';
import { Segmented, type SegmentedOption } from '../../../../shared/ui/Segmented';

import type { LayoutModeControlProps } from './LayoutModeControl.types';

const OPTIONS: ReadonlyArray<SegmentedOption<PodParentMode>> = [
  { value: 'node', label: 'Node' },
  { value: 'controller', label: 'Controller' },
];

export function LayoutModeControl({ mode, onChange, action, children }: Readonly<LayoutModeControlProps>): JSX.Element {
  return (
    <RailGroup title="Layout" action={action} data-testid="layout-mode-control">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`${subEyebrowClass} w-14 shrink-0`}>Group by</span>
          <Segmented
            name="pod-parent-mode"
            aria-label="Pod parent"
            value={mode}
            options={OPTIONS}
            onChange={onChange}
            className="min-w-0 flex-1"
          />
        </div>
        {children}
      </div>
    </RailGroup>
  );
}
