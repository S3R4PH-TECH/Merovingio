import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Root } from '../Root';

describe('Root routing', () => {
  it('lands on the Recon Tracker when there is no hash at all', async () => {
    window.location.hash = '';
    render(<Root />);
    expect(await screen.findByText('Recon & Workflow')).toBeInTheDocument();
  });

  it('stays on the Recon Tracker for an unrelated hash', async () => {
    window.location.hash = '#/anything-else';
    render(<Root />);
    expect(await screen.findByText('Recon & Workflow')).toBeInTheDocument();
  });

  it('renders the Recon Tracker on its own routes', async () => {
    window.location.hash = '#/overview';
    render(<Root />);
    expect(await screen.findByText('Recon & Workflow')).toBeInTheDocument();
  });

  it('still reaches the legacy recon dashboard on #/legacy', () => {
    window.location.hash = '#/legacy';
    render(<Root />);
    expect(screen.queryByText('Recon & Workflow')).not.toBeInTheDocument();
  });

  it('swaps apps when the hash changes at runtime', async () => {
    window.location.hash = '';
    render(<Root />);
    await screen.findByText('Recon & Workflow');

    act(() => {
      window.location.hash = '#/legacy';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    await waitFor(() =>
      expect(screen.queryByText('Recon & Workflow')).not.toBeInTheDocument(),
    );
  });

  it('never mounts both dashboards at once', async () => {
    window.location.hash = '';
    render(<Root />);
    await screen.findByText('Recon & Workflow');
    expect(screen.queryByRole('heading', { name: /merov/i })).not.toBeInTheDocument();
  });
});
