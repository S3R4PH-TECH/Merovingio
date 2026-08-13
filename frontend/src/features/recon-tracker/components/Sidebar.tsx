import { Bug, LayoutGrid, LogOut, Play, Radar, Server, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { routeToHash } from '../lib/useHashRoute';
import type { RouteKey } from '../types';

interface NavEntry {
  route: RouteKey;
  label: string;
  icon: LucideIcon;
}

const SECTIONS: { title: string; entries: NavEntry[] }[] = [
  {
    title: 'Operations',
    entries: [
      { route: 'overview', label: 'Overview', icon: LayoutGrid },
      { route: 'runs', label: 'All Runs', icon: Play },
      { route: 'active', label: 'Active Runs', icon: Radar },
      { route: 'debug', label: 'Debug n8n', icon: Bug },
    ],
  },
  {
    title: 'Administration',
    entries: [
      // Scope lives beside the executions on All Runs rather than on a page of
      // its own — deciding what may be touched and watching what ran against
      // it is one task, not two.
      { route: 'tes', label: 'TES Registry', icon: Server },
      { route: 'profile', label: 'Profile', icon: UserRound },
    ],
  },
];

interface SidebarProps {
  route: RouteKey;
  collapsed: boolean;
  onNavigate: (route: RouteKey) => void;
  onSignOut?: () => void;
  userName?: string;
  /** Profile photo; the initial stands in when there is none. */
  avatarUrl?: string | null;
  mobileOpen?: boolean;
}

export function Sidebar({
  route,
  collapsed,
  onNavigate,
  onSignOut,
  userName = 'Operator',
  avatarUrl = null,
  mobileOpen = false,
}: SidebarProps) {
  return (
    <nav
      className="rt-sidebar"
      aria-label="Main navigation"
      data-collapsed={collapsed}
      data-mobile-open={mobileOpen}
    >
      <div className="rt-brand">
        <span className="rt-brand-mark" aria-hidden="true">
          <BrandMark size={18} />
        </span>
        <span className="rt-brand-text">
          <span className="rt-brand-name">Merovíngio</span>
          <span className="rt-brand-tagline">Recon &amp; Workflow</span>
        </span>
      </div>

      {SECTIONS.map(section => (
        <div className="rt-nav-section" key={section.title}>
          <p className="rt-nav-overline">{section.title}</p>
          <ul className="rt-nav-list">
            {section.entries.map(({ route: target, label, icon: Icon }) => (
              <li key={target}>
                <a
                  className="rt-nav-item"
                  href={routeToHash(target)}
                  aria-current={route === target ? 'page' : undefined}
                  title={collapsed ? label : undefined}
                  onClick={event => {
                    event.preventDefault();
                    onNavigate(target);
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
                  {/*
                    The label stays in the DOM when collapsed — it is only faded
                    out — so the accessible name survives and screen reader users
                    are not left with five unlabelled icons.
                  */}
                  <span className="rt-nav-label">{label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="rt-sidebar-footer">
        {avatarUrl ? (
          // aria-hidden like the initial it replaces: the name is spelled out
          // in the very next element, so announcing the photo too is noise.
          <img className="rt-avatar-image" src={avatarUrl} alt="" aria-hidden="true" />
        ) : (
          <span className="rt-avatar" aria-hidden="true">
            {userName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="rt-user-text">
          <span className="rt-user-name">{userName}</span>
          <span className="rt-user-role">Admin</span>
        </span>
        <button
          type="button"
          className="rt-icon-button"
          aria-label="Log out"
          onClick={onSignOut}
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
