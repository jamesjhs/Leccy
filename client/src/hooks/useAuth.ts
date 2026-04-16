import { useState, useEffect, useCallback } from 'react';
import { authApi, UserInfo } from '../utils/api';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
}

interface UseAuthReturn extends AuthState {
  login: (email: string, password: string) => Promise<{ requires_2fa?: boolean; temp_token?: string }>;
  logout: () => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  setAuth: (token: string, user: UserInfo) => void;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('token'),
    isLoading: true,
    isAdmin: false,
  });

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setState({ user: null, token: null, isLoading: false, isAdmin: false });
      return;
    }
    try {
      const res = await authApi.me();
      setState({
        user: res.data.user,
        token,
        isLoading: false,
        isAdmin: res.data.user.is_admin === 1,
      });
    } catch {
      localStorage.removeItem('token');
      setState({ user: null, token: null, isLoading: false, isAdmin: false });
    }
  }, []);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  const setAuth = useCallback((token: string, user: UserInfo) => {
    localStorage.setItem('token', token);
    setState({
      user,
      token,
      isLoading: false,
      isAdmin: user.is_admin === 1,
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const data = res.data;
    if ('requires_2fa' in data && data.requires_2fa) {
      return { requires_2fa: true, temp_token: data.temp_token };
    }
    if ('token' in data) {
      const { token, user } = data;
      setAuth(token, user);
    }
    return {};
  }, [setAuth]);

  const register = useCallback(async (email: string, password: string, display_name?: string) => {
    const res = await authApi.register(email, password, display_name);
    const { token, user } = res.data;
    setAuth(token, user);
  }, [setAuth]);

  const verifyMagicLink = useCallback(async (token: string) => {
    const res = await authApi.verifyMagicLink(token);
    const { token: jwt, user } = res.data;
    setAuth(jwt, user);
  }, [setAuth]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem('token');
      setState({ user: null, token: null, isLoading: false, isAdmin: false });
    }
  }, []);

  return { ...state, login, logout, register, verifyMagicLink, setAuth };
}
