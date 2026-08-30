import { clsx } from 'clsx';
import type { JSX } from 'react';

import { EyeButton } from '../../../../shared/ui/EyeButton';
import { eyebrowClass } from '../../../../shared/ui/Section';
import { legendDimmedClass } from '../../legendStyles';

import type { IngressToggleProps } from './IngressToggle.types';

// A group that is nothing but its own switch: it keeps the RailGroup header rhythm so it
// reads as one more instrument in the stack, and skips the empty body a RailGroup would
// otherwise wrap around nothing.
export function IngressToggle({ visible, onToggle }: Readonly<IngressToggleProps>): JSX.Element {
  return (
    <section className="border-t border-hairline px-3 py-1.5" data-testid="ingress-toggle">
      <div className="flex min-h-[22px] items-center justify-between gap-2">
        <h4 className={clsx(eyebrowClass, !visible && legendDimmedClass)}>Ingress Gateway</h4>
        <EyeButton
          name={visible ? 'eye' : 'eye-slash'}
          tooltip={`${visible ? 'Hide' : 'Show'} ingress gateway`}
          onClick={onToggle}
          data-testid="ingress-toggle-button"
        />
      </div>
    </section>
  );
}
