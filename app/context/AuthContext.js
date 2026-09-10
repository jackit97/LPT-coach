import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

const USER_KEY = 'lptcoach_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enduranceEnabled, setEnduranceEnabled] = useState(true);

  const refreshEnduranceSetting = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me');
      setEnduranceEnabled(data?.endurance_visible !== false);
    } catch { /* keep previous value on failure */ }
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(USER_KEY);
      if (stored) setUser(JSON.parse(stored));
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (user) refreshEnduranceSetting(); }, [user, refreshEnduranceSetting]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (nome, email, password, ruolo) => {
    const { data } = await api.post('/auth/register', { nome, email, password, ruolo });
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
    setEnduranceEnabled(true);
  }, []);

  const value = useMemo(() => ({
    user, loading, login, register, logout, isCoach: user?.ruolo === 'personal_trainer',
    enduranceEnabled, setEnduranceEnabled, refreshEnduranceSetting,
  }), [user, loading, login, register, logout, enduranceEnabled, refreshEnduranceSetting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
