import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../components/Sidebar';

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const onNavigate = vi.fn();
  const utils = render(
    <Sidebar route="overview" collapsed={false} onNavigate={onNavigate} {...props} />,
  );
  return { onNavigate, ...utils };
}

describe('Sidebar', () => {
  it('exposes itself as the main navigation landmark', () => {
    renderSidebar();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });

  it('shows the product identity', () => {
    renderSidebar();
    expect(screen.getByText('Merovíngio')).toBeInTheDocument();
    expect(screen.getByText('Recon & Workflow')).toBeInTheDocument();
  });

  it('groups links under Main and Administration', () => {
    renderSidebar();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
  });

  it('renders every navigation entry', () => {
    renderSidebar();
    for (const label of [
      'Overview',
      'All Runs',
      'Active Runs',
      'Debug n8n',
      'TES Registry',
      'Profile',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('marks exactly the active route with aria-current', () => {
    renderSidebar({ route: 'active' });
    expect(screen.getByRole('link', { name: 'Active Runs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('reports a single current page at a time', () => {
    renderSidebar({ route: 'overview' });
    const current = screen
      .getAllByRole('link')
      .filter(link => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
  });

  it('notifies the parent when a route is picked', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderSidebar();
    await user.click(screen.getByRole('link', { name: 'Active Runs' }));
    expect(onNavigate).toHaveBeenCalledWith('active');
  });

  it('keeps accessible names for every entry when collapsed', () => {
    renderSidebar({ collapsed: true });
    for (const label of ['Overview', 'All Runs', 'TES Registry']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('flags the collapsed state on the element itself', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toHaveAttribute(
      'data-collapsed',
      'true',
    );
  });

  it('shows the signed in user and a logout affordance', () => {
    renderSidebar();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log ?out/i })).toBeInTheDocument();
  });

  it('reaches the profile page', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderSidebar();
    await user.click(screen.getByRole('link', { name: 'Profile' }));
    expect(onNavigate).toHaveBeenCalledWith('profile');
  });

  describe('the user photo', () => {
    it('falls back to an initial when there is none', () => {
      renderSidebar({ userName: 'Alex Morgan' });
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('shows the photo once the account has one', () => {
      const { container } = renderSidebar({
        userName: 'Alex Morgan',
        avatarUrl: 'https://cdn.example.org/alex.png',
      });

      const photo = container.querySelector('.rt-avatar-image');
      expect(photo).toHaveAttribute('src', 'https://cdn.example.org/alex.png');
      // Decorative: the name is spelled out in the element right beside it, so
      // announcing the photo as well would only repeat it.
      expect(photo).toHaveAttribute('alt', '');
      expect(screen.queryByText('A')).not.toBeInTheDocument();
    });
  });
});
