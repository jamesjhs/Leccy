import { useState, useEffect, useCallback } from 'react';
import { authApi, UserInfo } from '../utils/api';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
}

interface UseAuthReturn extends AuthState {
  login: (licencePlate: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const login = useCallback(async (licencePlate: string, password: string) => {
    const res = await authApi.login(licencePlate, password);
    const { token, user } = res.data;
    localStorage.setItem('token', token);
    setState({
      user,
      token,
      isLoading: false,
      isAdmin: user.is_admin === 1,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem('token');
      setState({ user: null, token: null, isLoading: false, isAdmin: false });
    }
  }, []);

  return { ...state, login, logout };
}
