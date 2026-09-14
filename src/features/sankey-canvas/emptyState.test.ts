import { describe, expect, it } from 'vitest';

import { shellEmptyKind, type ShellEmptyInputs } from './emptyState';

const LIVE: ShellEmptyInputs = {
  demoMode: false,
  endpointConfigured: true,
  scopeReady: true,
  status: 'idle',
  hasPayload: false,
  cancelled: false,
};

describe('shellEmptyKind', () => {
  it('never reports a shell cause in demo mode', () => {
    expect(shellEmptyKind({ ...LIVE, demoMode: true, endpointConfigured: false, scopeReady: false })).toBeNull();
  });

  it('orders the causes: unconfigured, then scope, then awaiting, then cancelled', () => {
    expect(shellEmptyKind({ ...LIVE, endpointConfigured: false, scopeReady: false })).toBe('unconfigured');
    expect(shellEmptyKind({ ...LIVE, scopeReady: false })).toBe('scope');
    expect(shellEmptyKind(LIVE)).toBe('awaiting');
    expect(shellEmptyKind({ ...LIVE, cancelled: true })).toBe('cancelled');
  });

  it('keeps a drawn body when the draft is edited into an incomplete scope', () => {
    // The regression this file exists for: after a successful Query, unchecking the last
    // root must not swap the chart for "no request has been sent yet".
    expect(shellEmptyKind({ ...LIVE, status: 'ready', hasPayload: true, scopeReady: false })).toBeNull();
  });

  it('keeps a drawn body across a cancelled refresh', () => {
    expect(shellEmptyKind({ ...LIVE, status: 'ready', hasPayload: true, cancelled: true })).toBeNull();
  });

  it('hands over to the body once a payload is drawn', () => {
    expect(shellEmptyKind({ ...LIVE, status: 'ready', hasPayload: true })).toBeNull();
    expect(shellEmptyKind({ ...LIVE, status: 'error', hasPayload: true })).toBeNull();
  });
});
