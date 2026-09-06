import type { JSX } from 'react';

import { resultTypeColor } from '../../../../shared/constants/colorByResultType';
import { MISSING_VALUE_PLACEHOLDER } from '../../../../shared/constants/missingValuePlaceholder';

import type { ChangeTypeCellProps } from './ChangeTypeCell.types';

export function ChangeTypeCell({ type, testId }: Readonly<ChangeTypeCellProps>): JSX.Element {
  if (type === undefined || type.length === 0) {
    return (
      <span className="text-muted" {...(testId !== undefined ? { 'data-testid': testId } : {})}>
        {MISSING_VALUE_PLACEHOLDER}
      </span>
    );
  }
  return (
    <span
      className="text-xs font-medium uppercase"
      style={{ color: resultTypeColor(type), textTransform: 'uppercase' }}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      {type}
    </span>
  );
}
