import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  /** Rendered on the trigger, e.g. "Role: Admin". */
  triggerLabel: string;
  options: readonly DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Shows the small emerald dot before the label, marking an active session. */
  showStatusDot?: boolean;
}

export function Dropdown<T extends string>({
  triggerLabel,
  options,
  value,
  onChange,
  showStatusDot = false,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="rt-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="rt-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen(current => !current)}
      >
        {showStatusDot && <span className="rt-status-dot" aria-hidden="true" />}
        {triggerLabel}
        <ChevronDown className="rt-chevron" size={14} aria-hidden="true" />
      </button>

      {open && (
        <ul className="rt-menu" id={listboxId} role="listbox">
          {options.map(option => (
            <li key={option.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className="rt-menu-item"
                onClick={() => {
                  onChange(option.value);
                  close(false);
                }}
              >
                {option.label}
                {option.value === value && <Check size={14} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
