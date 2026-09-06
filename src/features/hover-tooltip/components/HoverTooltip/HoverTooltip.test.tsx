import { render, screen } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import React from 'react';
import { vi } from 'vitest';

import { DARK_TOKENS } from '../../../../shared/theme/tokens';
import { useHoverElement } from '../../hooks/useHoverElement';

vi.mock('../../hooks/useHoverElement', () => ({
  useHoverElement: vi.fn(),
}));

import { HoverTooltip } from './HoverTooltip';

const mockHover = vi.mocked(useHoverElement);
const cyRefStub = { current: null as cytoscape.Core | null };
const errorTextColor = DARK_TOKENS.status.error;

describe('HoverTooltip', () => {
  let owSpy: { mockRestore: () => void };
  let ohSpy: { mockRestore: () => void };
  beforeEach(() => {
    mockHover.mockReset();
    owSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    ohSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80);
  });
  afterEach(() => {
    owSpy.mockRestore();
    ohSpy.mockRestore();
  });

  it('renders nothing when there is no hover and nothing pinned', () => {
    mockHover.mockReturnValue(null);
    const { container } = render(<HoverTooltip cyRef={cyRefStub} ready />);
    expect(container.querySelector('[data-testid="hover-tooltip"]')).toBeNull();
  });

  it('renders a node tooltip from hovered data', () => {
    mockHover.mockReturnValue({
      group: 'nodes',
      id: 'p1',
      data: { id: 'p1', label: 'mongo-0', kind: 'pod' },
      position: { x: 10, y: 10 },
    });
    render(<HoverTooltip cyRef={cyRefStub} ready />);
    expect(screen.getByTestId('hover-tooltip')).toHaveTextContent('mongo-0');
  });

  it('renders RED edge metrics and omits absent fields (does not show them as 0)', () => {
    mockHover.mockReturnValue({
      group: 'edges',
      id: 'e1',
      data: { id: 'e1', source: 'a', target: 'b', edgeType: 'pod-calls-pod', metrics: { rate: 1, errorRate: 0.5 } },
      position: { x: 10, y: 10 },
    });
    render(<HoverTooltip cyRef={cyRefStub} ready />);
    const tip = screen.getByTestId('hover-tooltip');
    expect(tip.textContent).toMatch(/req\/s/);
    expect(tip.textContent).not.toMatch(/0 req\/s/);
    expect(tip.innerHTML.includes(errorTextColor) || tip.textContent?.includes('%')).toBe(true);
  });

  it('renders storage I/O metrics when present', () => {
    mockHover.mockReturnValue({
      group: 'edges',
      id: 'e2',
      data: {
        id: 'e2',
        source: 'pvc',
        target: 'aggr',
        edgeType: 'pvc-to-netapp-aggr',
        metrics: { readBytesPerSec: 5242880, writeBytesPerSec: 1048576 },
      },
      position: { x: 10, y: 10 },
    });
    render(<HoverTooltip cyRef={cyRefStub} ready />);
    expect(screen.getByTestId('hover-tooltip').textContent).toMatch(/B\/s|MB\/s|KB\/s/);
  });
});
