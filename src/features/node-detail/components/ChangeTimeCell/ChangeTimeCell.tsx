import type { JSX } from 'react';

import { MISSING_VALUE_PLACEHOLDER } from '../../../../shared/constants/missingValuePlaceholder';

import type { ChangeTimeCellProps } from './ChangeTimeCell.types';

export function ChangeTimeCell({ formatted, title, testId }: Readonly<ChangeTimeCellProps>): JSX.Element {
  if (formatted === undefined) {
    return (
      <span className="text-muted" {...(testId !== undefined ? { 'data-testid': testId } : {})}>
        {MISSING_VALUE_PLACEHOLDER}
      </span>
    );
  }
  return (
    <span title={title} {...(testId !== undefined ? { 'data-testid': testId } : {})}>
      {formatted}
    </span>
  );
}
