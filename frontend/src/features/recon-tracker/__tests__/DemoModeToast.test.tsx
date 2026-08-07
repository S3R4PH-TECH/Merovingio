import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoModeToast } from '../components/DemoModeToast';

describe('DemoModeToast', () => {
  it('announces itself politely as a status, not an alert', () => {
    render(<DemoModeToast onDismiss={vi.fn()} />);
    const toast = screen.getByRole('status');
    expect(toast).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('carries the demo mode copy', () => {
    render(<DemoModeToast onDismiss={vi.fn()} />);
    expect(screen.getByText('Demo Mode')).toBeInTheDocument();
    expect(
      screen.getByText(/no runs returned by the gateway — showing sample data/i),
    ).toBeInTheDocument();
  });

  it('offers a named dismiss control', () => {
    render(<DemoModeToast onDismiss={vi.fn()} />);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('reports the dismissal', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<DemoModeToast onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('is dismissable from the keyboard', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<DemoModeToast onDismiss={onDismiss} />);
    screen.getByRole('button', { name: /dismiss/i }).focus();
    await user.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
