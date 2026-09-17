import type { JSX } from 'react';

import { ControlField } from '../../shared/ui/ControlField';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import { StatusLegend, Swatch } from '../sankey-canvas';
import { useThemeTokens } from '../theme';

import type { SankeyMode, SankeySvmDisplay } from './deriveSankey';
import type { SankeyPodLayout } from './layoutSankey';
import type { SankeyPodCut } from './useSankeyProjection';

const MODE_OPTIONS: ReadonlyArray<SegmentedOption<SankeyMode>> = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'both', label: 'Both' },
];

const LAYOUT_OPTIONS: ReadonlyArray<SegmentedOption<SankeyPodLayout>> = [
  { value: 'flat', label: 'Flat' },
  { value: 'node', label: 'Node' },
];

export const SVM_UNAVAILABLE_REASON = 'The backend reports no claim aggregates';

const svmOptions = (available: boolean): ReadonlyArray<SegmentedOption<SankeySvmDisplay>> => [
  { value: 'column', label: 'Column' },
  {
    value: 'group',
    label: 'Group',
    disabled: !available,
    ...(available ? {} : { title: SVM_UNAVAILABLE_REASON }),
  },
];

const NOTE_CLASS = 'flex h-8 items-center whitespace-nowrap text-[11px] text-secondary';

export interface SankeyViewControlsProps {
  mode: SankeyMode;
  onModeChange: (next: SankeyMode) => void;
  podLayout: SankeyPodLayout;
  onPodLayoutChange: (next: SankeyPodLayout) => void;
  /** The display drawn — `column` whenever `Group` is unavailable. */
  svmDisplay: SankeySvmDisplay;
  onSvmDisplayChange: (next: SankeySvmDisplay) => void;
  svmAvailable: boolean;
  /** Present only while the Top pods cut hid a pod. */
  podCut: SankeyPodCut | undefined;
}

/**
 * The Storage Sankey's view controls, after the Query action in the scope bar: the mode,
 * how pods and SVMs are presented, what the Top pods cut hid, and what the marks mean.
 * None of them edits the draft or issues a request, and all stay operable in every empty
 * state.
 */
export function SankeyViewControls({
  mode,
  onModeChange,
  podLayout,
  onPodLayoutChange,
  svmDisplay,
  onSvmDisplayChange,
  svmAvailable,
  podCut,
}: Readonly<SankeyViewControlsProps>): JSX.Element {
  const tokens = useThemeTokens();
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2" data-testid="sankey-view-controls">
      <ControlField label="Mode">
        <Segmented
          name="sankey-mode"
          aria-label="Sankey mode"
          size="md"
          value={mode}
          options={MODE_OPTIONS}
          onChange={onModeChange}
          data-testid="sankey-mode"
        />
      </ControlField>
      <ControlField label="Layout">
        <Segmented
          name="sankey-layout"
          aria-label="Layout"
          size="md"
          value={podLayout}
          options={LAYOUT_OPTIONS}
          onChange={onPodLayoutChange}
          data-testid="sankey-layout"
        />
      </ControlField>
      <ControlField label="SVM">
        <Segmented
          name="sankey-svm-display"
          aria-label="SVM"
          size="md"
          value={svmDisplay}
          options={svmOptions(svmAvailable)}
          onChange={onSvmDisplayChange}
          data-testid="sankey-svm-display"
        />
      </ControlField>
      {!svmAvailable && (
        <span className={NOTE_CLASS} data-testid="sankey-svm-display-reason">
          {SVM_UNAVAILABLE_REASON}
        </span>
      )}
      {podCut !== undefined && (
        <span className={NOTE_CLASS} data-testid="sankey-top-pods-label">
          {podCut.shown} of {podCut.total} pods
        </span>
      )}
      <div className="flex h-8 items-center gap-3" data-testid="sankey-legend">
        <StatusLegend />
        <span aria-hidden className="h-4 border-l border-medium" />
        {(mode === 'both' || mode === 'read') && (
          <span className="flex items-center gap-1.5 text-[11px] text-secondary" data-testid="sankey-legend-read">
            <Swatch color={tokens.sankey.read} />
            read
          </span>
        )}
        {(mode === 'both' || mode === 'write') && (
          <span className="flex items-center gap-1.5 text-[11px] text-secondary" data-testid="sankey-legend-write">
            <Swatch color={tokens.sankey.write} dashed />
            write
          </span>
        )}
      </div>
    </div>
  );
}
