import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfigErrorScreen } from './ConfigErrorScreen';

describe('ConfigErrorScreen', () => {
  it('shows the config path and problem, and Retry refires', async () => {
    const onRetry = vi.fn();
    render(<ConfigErrorScreen path="/config.json" problem="HTTP 404" onRetry={onRetry} />);
    expect(screen.getByTestId('config-error-screen')).toBeInTheDocument();
    expect(screen.getByText(/\/config.json/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
