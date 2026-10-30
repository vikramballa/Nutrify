import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  apiFetch,
  type ApiError,
  getToken,
  setToken,
  clearToken,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
  setOnAuthExpired,
} from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  onboarded: boolean;
  /** Agreed to send photos and profile to the AI provider (App Store 5.1.2(i)). */
  aiConsent: boolean;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean; // finished restoring any stored session
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  markOnboarded: () => void; // flip the gate after the questionnaire is saved
  setAiConsent: (granted: boolean) => Promise<void>;
  /** Permanently deletes the account; throws on a wrong password. */
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Last signed-in user, so a launch without the server still opens the app. */
const USER_KEY = 'authUser';

async function cachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  // Wire session-expiry handling, then restore any stored session on launch.
  useEffect(() => {
    // A failed token refresh anywhere in the app lands here: drop the session.
    setOnAuthExpired(() => {
      queryClient.clear();
      setUser(null);
      AsyncStorage.removeItem(USER_KEY).catch(() => {});
    });

    (async () => {
      const [token, refreshToken] = await Promise.all([getToken(), getRefreshToken()]);
      if (token || refreshToken) {
        try {
          // A 401 here triggers a transparent refresh+retry inside apiFetch.
          const me = await apiFetch<AuthUser>('/auth/me');
          setUser(me);
        } catch (err) {
          if ((err as ApiError).status === 401) {
            await clearToken(); // session unrecoverable
          } else {
            // Server unreachable or failing, not a rejected session: open on
            // the cached user and persisted queries. Clearing the token here
            // signed people out every time they launched away from the server.
            setUser(await cachedUser());
          }
        }
      }
      setReady(true);
    })();

    return () => setOnAuthExpired(null);
  }, [queryClient]);

  useEffect(() => {
    if (user) AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
  }, [user]);

  async function authenticate(path: string, body: object) {
    const res = await apiFetch<AuthResponse>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await setToken(res.accessToken);
    await setRefreshToken(res.refreshToken);
    queryClient.clear(); // drop any cached data from a previous session
    setUser(res.user);
  }

  // Everything this device holds for the session, gone.
  async function endSession() {
    await clearToken();
    await clearRefreshToken();
    await AsyncStorage.removeItem(USER_KEY).catch(() => {});
    queryClient.clear();
    setUser(null);
  }

  const value: AuthContextValue = {
    user,
    ready,
    login: (email, password) => authenticate('/auth/login', { email, password }),
    register: (email, password, name) =>
      authenticate('/auth/register', { email, password, name }),
    logout: async () => {
      // Best-effort server-side revocation of the refresh token.
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        try {
          await apiFetch('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          });
        } catch {
          // revoke failed — clear locally anyway
        }
      }
      await endSession();
    },
    markOnboarded: () => setUser((u) => (u ? { ...u, onboarded: true } : u)),
    setAiConsent: async (granted) => {
      await apiFetch('/profile/ai-consent', {
        method: 'PUT',
        body: JSON.stringify({ granted }),
      });
      setUser((u) => (u ? { ...u, aiConsent: granted } : u));
    },
    deleteAccount: async (password) => {
      await apiFetch('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) });
      await endSession();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
