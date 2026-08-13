import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { parseHashRoute, routeToHash, useHashRoute } from '../lib/useHashRoute';

describe('parseHashRoute', () => {
  it('treats an empty hash as the overview, because this is the app', () => {
    expect(parseHashRoute('')?.key).toBe('overview');
    expect(parseHashRoute('#/')?.key).toBe('overview');
  });

  it('maps every known route', () => {
    expect(parseHashRoute('#/overview')?.key).toBe('overview');
    expect(parseHashRoute('#/runs')?.key).toBe('runs');
    expect(parseHashRoute('#/active')?.key).toBe('active');
    expect(parseHashRoute('#/tes')?.key).toBe('tes');
    expect(parseHashRoute('#/debug')?.key).toBe('debug');
  });

  it('tolerates a trailing slash', () => {
    expect(parseHashRoute('#/runs/')?.key).toBe('runs');
  });

  it('returns null for the legacy dashboard so Root can hand over', () => {
    expect(parseHashRoute('#/legacy')).toBeNull();
  });

  it('reads a run id out of #/runs/<id> for deep links', () => {
    const route = parseHashRoute('#/runs/abc-123');
    expect(route?.key).toBe('runs');
    expect(route?.runId).toBe('abc-123');
  });

  it('returns null for an unknown route rather than guessing', () => {
    expect(parseHashRoute('#/nope')).toBeNull();
  });
});

describe('routeToHash', () => {
  it('round trips through parseHashRoute', () => {
    for (const route of ['overview', 'runs', 'active', 'tes', 'debug'] as const) {
      expect(parseHashRoute(routeToHash(route))?.key).toBe(route);
    }
  });
});

describe('useHashRoute', () => {
  it('defaults to the overview when the hash is empty', () => {
    window.location.hash = '';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route.key).toBe('overview');
  });

  it('reads the current hash on mount', () => {
    window.location.hash = '#/active';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route.key).toBe('active');
  });

  it('navigates by writing the hash', () => {
    window.location.hash = '#/overview';
    const { result } = renderHook(() => useHashRoute());

    act(() => result.current.navigate('tes'));

    expect(result.current.route.key).toBe('tes');
    expect(window.location.hash).toBe('#/tes');
  });

  it('reacts to an external hash change', () => {
    window.location.hash = '#/overview';
    const { result } = renderHook(() => useHashRoute());

    act(() => {
      window.location.hash = '#/debug';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current.route.key).toBe('debug');
  });

  it('sends a stale #/scope bookmark to the overview rather than nowhere', () => {
    // Scope moved into All Runs, so the route is gone. parseHashRoute returns
    // null for it, and the hook must fall back rather than render an empty
    // shell for anyone who bookmarked the old page.
    window.location.hash = '#/scope';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route.key).toBe('overview');
  });
});
