import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../components/Header';

function renderHeader(props: Partial<React.ComponentProps<typeof Header>> = {}) {
  const handlers = {
    onToggleSidebar: vi.fn(),
    onToggleTheme: vi.fn(),
    onRoleChange: vi.fn(),
    onProgramChange: vi.fn(),
  };
  const utils = render(
    <Header
      sidebarCollapsed={false}
      theme="dark"
      role="Admin"
      program="All Programs"
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, ...utils };
}

describe('Header', () => {
  it('is a banner landmark', () => {
    renderHeader();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  describe('sidebar toggle', () => {
    it('describes the action, not the icon', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
    });

    it('reports the expanded state', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('flips its label and state once collapsed', () => {
      renderHeader({ sidebarCollapsed: true });
      const button = screen.getByRole('button', { name: /expand sidebar/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('calls back on click', async () => {
      const user = userEvent.setup();
      const { onToggleSidebar } = renderHeader();
      await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));
      expect(onToggleSidebar).toHaveBeenCalledOnce();
    });
  });

  describe('theme toggle', () => {
    it('announces the theme it switches to', () => {
      renderHeader({ theme: 'dark' });
      expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();
    });

    it('announces the reverse when already light', () => {
      renderHeader({ theme: 'light' });
      expect(screen.getByRole('button', { name: /switch to dark theme/i })).toBeInTheDocument();
    });

    it('calls back on click', async () => {
      const user = userEvent.setup();
      const { onToggleTheme } = renderHeader();
      await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
      expect(onToggleTheme).toHaveBeenCalledOnce();
    });
  });

  describe('role dropdown', () => {
    it('shows the active role on the trigger', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: /role: admin/i })).toBeInTheDocument();
    });

    it('starts collapsed', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: /role: admin/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('opens a listbox of roles', async () => {
      const user = userEvent.setup();
      renderHeader();
      await user.click(screen.getByRole('button', { name: /role: admin/i }));

      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
      for (const role of ['Admin', 'Operator', 'Viewer']) {
        expect(screen.getByRole('option', { name: role })).toBeInTheDocument();
      }
    });

    it('marks the active option as selected', async () => {
      const user = userEvent.setup();
      renderHeader();
      await user.click(screen.getByRole('button', { name: /role: admin/i }));
      expect(screen.getByRole('option', { name: 'Admin' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('reports the chosen role', async () => {
      const user = userEvent.setup();
      const { onRoleChange } = renderHeader();
      await user.click(screen.getByRole('button', { name: /role: admin/i }));
      await user.click(screen.getByRole('option', { name: 'Operator' }));
      expect(onRoleChange).toHaveBeenCalledWith('Operator');
    });

    it('closes on Escape and hands focus back to the trigger', async () => {
      const user = userEvent.setup();
      renderHeader();
      const trigger = screen.getByRole('button', { name: /role: admin/i });
      await user.click(trigger);
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  describe('program dropdown', () => {
    it('shows the active program', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: /program: all programs/i })).toBeInTheDocument();
    });

    it('reports the chosen program', async () => {
      const user = userEvent.setup();
      const { onProgramChange } = renderHeader();
      await user.click(screen.getByRole('button', { name: /program: all programs/i }));
      await user.click(screen.getByRole('option', { name: 'Internal' }));
      expect(onProgramChange).toHaveBeenCalledWith('Internal');
    });
  });
});
