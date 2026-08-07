import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewRunModal } from '../components/NewRunModal';
import type { TargetItem, WorkflowItem } from '../types';

const WORKFLOWS: WorkflowItem[] = [
  {
    id: 'wf-1',
    workspace_id: 'ws-1',
    name: 'recon-baseline',
    git_path: 'workflows/recon-baseline.json',
    current_version: '1',
    production_webhook_url: null,
    created_at: '2026-08-01T00:00:00.000Z',
  },
];

const TARGETS: TargetItem[] = [
  {
    id: 'tg-1',
    program_id: 'pg-1',
    name: 'Acme production',
    root_domains: ['example.org'],
    cidrs: [],
    out_of_scope: [],
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

function renderModal(props: Partial<React.ComponentProps<typeof NewRunModal>> = {}) {
  const onClose = vi.fn();
  const onDispatch = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <NewRunModal
      open
      workflows={WORKFLOWS}
      targets={TARGETS}
      onClose={onClose}
      onDispatch={onDispatch}
      {...props}
    />,
  );
  return { onClose, onDispatch, ...utils };
}

describe('NewRunModal', () => {
  it('renders nothing while closed', () => {
    renderModal({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog named by its title', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: /new run/i })).toHaveAttribute(
      'aria-modal',
      'true',
    );
  });

  it('moves focus to the workflow field on open', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByLabelText(/workflow/i)).toHaveFocus());
  });

  it('labels both fields with a real label element', () => {
    renderModal();
    expect(screen.getByLabelText(/workflow/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target/i)).toBeInTheDocument();
  });

  it('preselects the first workflow and target', () => {
    renderModal();
    expect(screen.getByLabelText(/workflow/i)).toHaveValue('wf-1');
    expect(screen.getByLabelText(/target/i)).toHaveValue('tg-1');
  });

  it('dispatches the chosen pair', async () => {
    const user = userEvent.setup();
    const { onDispatch } = renderModal();

    await user.click(screen.getByRole('button', { name: /dispatch run/i }));

    expect(onDispatch).toHaveBeenCalledWith({ workflowId: 'wf-1', targetId: 'tg-1' });
  });

  it('refuses to dispatch without a target', async () => {
    const user = userEvent.setup();
    const { onDispatch } = renderModal({ targets: [] });

    await user.click(screen.getByRole('button', { name: /dispatch run/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/select a target/i);
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('refuses to dispatch without a workflow', async () => {
    const user = userEvent.setup();
    const { onDispatch } = renderModal({ workflows: [] });

    await user.click(screen.getByRole('button', { name: /dispatch run/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/select a workflow/i);
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('explains why the workflow list is empty', () => {
    renderModal({ workflows: [] });
    expect(screen.getByText(/no workflows registered/i)).toBeInTheDocument();
  });

  it('surfaces a dispatch failure and stays open', async () => {
    const user = userEvent.setup();
    const onDispatch = vi.fn().mockRejectedValue(new Error('target_out_of_scope'));
    renderModal({ onDispatch });

    await user.click(screen.getByRole('button', { name: /dispatch run/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/target_out_of_scope/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from the cancel button', async () => {
    const user = userEvent.setup();
    const { onClose, onDispatch } = renderModal();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('traps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    renderModal();

    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 10; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
