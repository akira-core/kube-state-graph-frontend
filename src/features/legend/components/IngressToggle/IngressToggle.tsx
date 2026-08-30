import { clsx } from 'clsx';
import type { JSX } from 'react';

import { EyeButton } from '../../../../shared/ui/EyeButton';
import { legendDimmedClass, legendRowClass, legendToggleClass } from '../../legendStyles';

import type { IngressToggleProps } from './IngressToggle.types';

export function IngressToggle({ visible, onToggle }: Readonly<IngressToggleProps>): JSX.Element {
  return (
    <div data-testid="ingress-toggle">
      <div className={legendRowClass}>
        <h4 className={clsx('m-0', !visible && legendDimmedClass)}>Ingress Gateway</h4>
        <EyeButton
          className={legendToggleClass}
          name={visible ? 'eye' : 'eye-slash'}
          tooltip={`${visible ? 'Hide' : 'Show'} ingress gateway`}
          onClick={onToggle}
          data-testid="ingress-toggle-button"
        />
      </div>
    </div>
  );
}
