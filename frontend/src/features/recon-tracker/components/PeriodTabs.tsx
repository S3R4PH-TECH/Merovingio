import { useRef } from 'react';
import { PERIOD_LABELS, type PeriodKey } from '../types';

const ORDER: readonly PeriodKey[] = ['24h', '7d', '30d'];

interface PeriodTabsProps {
  value: PeriodKey;
  onChange: (period: PeriodKey) => void;
}

/**
 * Roving tabindex: only the selected tab is in the page tab order, and the arrow
 * keys move between them. That is the pattern screen reader users expect from
 * anything announced as a tablist.
 */
export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  const tabsRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (next: PeriodKey) => {
    onChange(next);
    tabsRef.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = ORDER.indexOf(value);
    if (index === -1) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(ORDER[(index + 1) % ORDER.length]);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(ORDER[(index - 1 + ORDER.length) % ORDER.length]);
        break;
      case 'Home':
        event.preventDefault();
        move(ORDER[0]);
        break;
      case 'End':
        event.preventDefault();
        move(ORDER[ORDER.length - 1]);
        break;
      default:
        break;
    }
  };

  return (
    <div className="rt-tablist" role="tablist" aria-label="Time period">
      {ORDER.map(period => (
        <button
          key={period}
          ref={element => {
            tabsRef.current[period] = element;
          }}
          type="button"
          role="tab"
          className="rt-tab"
          aria-selected={period === value}
          tabIndex={period === value ? 0 : -1}
          onClick={() => onChange(period)}
          onKeyDown={onKeyDown}
        >
          {PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  );
}
