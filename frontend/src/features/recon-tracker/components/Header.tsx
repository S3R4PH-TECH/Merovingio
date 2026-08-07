import { Moon, PanelLeft, Sun } from 'lucide-react';
import { Dropdown } from './Dropdown';
import { ROLES, PROGRAMS, type ThemeMode } from '../types';

interface HeaderProps {
  sidebarCollapsed: boolean;
  theme: ThemeMode;
  role: string;
  program: string;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onRoleChange: (role: string) => void;
  onProgramChange: (program: string) => void;
}

export function Header({
  sidebarCollapsed,
  theme,
  role,
  program,
  onToggleSidebar,
  onToggleTheme,
  onRoleChange,
  onProgramChange,
}: HeaderProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <header className="rt-header">
      <button
        type="button"
        className="rt-icon-button"
        // The name states the action the click performs, not the icon drawn.
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!sidebarCollapsed}
        aria-controls="rt-sidebar"
        onClick={onToggleSidebar}
      >
        <PanelLeft size={18} aria-hidden="true" />
      </button>

      <span className="rt-header-spacer" />

      <button
        type="button"
        className="rt-icon-button"
        aria-label={`Switch to ${nextTheme} theme`}
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? (
          <Sun size={18} aria-hidden="true" />
        ) : (
          <Moon size={18} aria-hidden="true" />
        )}
      </button>

      <Dropdown
        triggerLabel={`Role: ${role}`}
        options={ROLES.map(value => ({ value, label: value }))}
        value={role}
        onChange={onRoleChange}
        showStatusDot
      />

      <Dropdown
        triggerLabel={`Program: ${program}`}
        options={PROGRAMS.map(value => ({ value, label: value }))}
        value={program}
        onChange={onProgramChange}
      />
    </header>
  );
}
