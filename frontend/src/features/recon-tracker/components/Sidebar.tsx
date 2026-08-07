import { Crosshair, LayoutGrid, LogOut, Play, Radar, Server, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
      { route: 'findings', label: 'Findings', icon: ShieldAlert },
    ],
  },
  {
    title: 'Administration',
    entries: [
      { route: 'scope', label: 'Scope & Targets', icon: Crosshair },
      { route: 'tes', label: 'TES Registry', icon: Server },
    ],
  },
];

interface SidebarProps {
  route: RouteKey;
  collapsed: boolean;
  onNavigate: (route: RouteKey) => void;
  onSignOut?: () => void;
  userName?: string;
  mobileOpen?: boolean;
}

export function Sidebar({
  route,
  collapsed,
  onNavigate,
  onSignOut,
  userName = 'Operator',
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
          <Radar size={18} />
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
        <span className="rt-avatar" aria-hidden="true">
          {userName.charAt(0).toUpperCase()}
        </span>
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
