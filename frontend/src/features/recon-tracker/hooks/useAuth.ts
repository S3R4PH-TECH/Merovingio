import { useCallback, useEffect, useState } from 'react';
import { ApiError, readToken } from '../api/client';
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from '../api/gateway';
import type { MeResponse } from '../types';

export type AuthState = 'checking' | 'anonymous' | 'authenticated';

interface UseAuth {
  state: AuthState;
  user: MeResponse | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => void;
}

export function useAuth(): UseAuth {
  const [state, setState] = useState<AuthState>(() =>
    readToken() ? 'checking' : 'anonymous',
  );
  const [user, setUser] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A stored token proves nothing — it may have expired while the tab was
  // closed. GET /me is what actually decides whether the session is live.
  useEffect(() => {
    if (state !== 'checking') return;
    let active = true;

    fetchMe()
      .then(me => {
        if (!active) return;
        setUser(me);
        setState('authenticated');
      })
      .catch(() => {
        if (!active) return;
        apiLogout();
        setState('anonymous');
      });

    return () => {
      active = false;
    };
  }, [state]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await apiLogin(email, password);
      const me = await fetchMe();
      setUser(me);
      setState('authenticated');
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.status === 401
          ? 'Invalid email or password'
          : caught instanceof ApiError
            ? caught.message
            : 'Sign in failed';
      setError(message);
      setState('anonymous');
      throw caught;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    setError(null);
    try {
      await apiRegister(email, password, name);
      const me = await fetchMe();
      setUser(me);
      setState('authenticated');
    } catch (caught) {
      let message = 'Could not create the account';
      if (caught instanceof ApiError) {
        if (caught.status === 409) message = 'That email is already registered';
        else if (caught.status === 403) {
          message =
            'Registration is disabled on this gateway. Set GATEWAY_ALLOW_REGISTRATION=true to enable it.';
        } else if (caught.status === 429) message = 'Too many attempts — wait a moment';
        else message = caught.message;
      }
      setError(message);
      setState('anonymous');
      throw caught;
    }
  }, []);

  const signOut = useCallback(() => {
    apiLogout();
    setUser(null);
    setError(null);
    setState('anonymous');
  }, []);

  return { state, user, error, signIn, signUp, signOut };
}
