import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import api, { TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

const USER_KEY = 'lptcoach_user';
const REQUIRED_ATHLETE_FIELDS = ['cognome', 'datanascita', 'sesso', 'pesokg', 'altezzacm', 'obiettivoallenamento'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enduranceEnabled, setEnduranceEnabled] = useState(true);
  const [dietEnabled, setDietEnabled] = useState(true);
  const [strengthEnabled, setStrengthEnabled] = useState(true);
  const [progressEnabled, setProgressEnabled] = useState(true);
  // email verificata, notifiche email, consensi privacy (da /users/me)
  const [account, setAccount] = useState(null);
  const [profileComplete, setProfileComplete] = useState(true);

  const refreshAccountStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me');
      setEnduranceEnabled(data?.endurance_visible !== false);
      setDietEnabled(data?.dieta_visible !== false);
      setStrengthEnabled(data?.forza_visible !== false);
      setProgressEnabled(data?.progressi_visible !== false);
      setAccount({
        emailVerified: data?.email_verificata !== false,
        emailNotifications: data?.notifiche_email !== false,
        emailEnabled: !!data?.email_attiva,
        // consensi mancanti (o informativa cambiata): l'app chiede di accettarla prima di continuare
        needsConsent: !data?.privacy_accettata_at || !data?.consenso_salute_at
          || (data?.privacy_versione && data?.privacy_versione_attuale && data.privacy_versione !== data.privacy_versione_attuale),
      });
      // nome e cognome aggiornati (es. dopo la modifica del profilo o la migrazione del cognome)
      setUser((current) => {
        if (!current || (current.nome === data?.nome && (current.cognome || null) === (data?.cognome || null))) return current;
        const next = { ...current, nome: data?.nome ?? current.nome, cognome: data?.cognome || null };
        AsyncStorage.setItem(USER_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      setProfileComplete(data?.ruolo !== 'cliente' || REQUIRED_ATHLETE_FIELDS.every((field) => data?.[field] !== null && data?.[field] !== undefined && String(data[field]).trim() !== ''));
    } catch { /* keep previous value on failure */ }
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(USER_KEY);
      if (stored) setUser(JSON.parse(stored));
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (user) refreshAccountStatus(); }, [user, refreshAccountStatus]);

  // "Sono online": un segnale al minuto mentre l'app e' aperta e in primo piano (minuti di utilizzo per il profilo developer)
  useEffect(() => {
    if (!user) return undefined;
    const visible = () => (Platform.OS === 'web' ? typeof document === 'undefined' || document.visibilityState === 'visible' : AppState.currentState === 'active');
    const beat = () => { if (visible()) api.post('/dev/heartbeat', { piattaforma: Platform.OS }).catch(() => {}); };
    beat();
    const timer = setInterval(beat, 60000);
    return () => clearInterval(timer);
  }, [user?.id]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (nome, cognome, email, password, consents = {}) => {
    const { data } = await api.post('/auth/register', { nome, cognome, email, password, ruolo: 'cliente', privacy: !!consents.privacy, datiSalute: !!consents.datiSalute });
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
    setDietEnabled(true);
    setStrengthEnabled(true);
    setProgressEnabled(true);
    setAccount(null);
    setProfileComplete(true);
  }, []);

  const value = useMemo(() => ({
    user, loading, login, register, logout, isCoach: user?.ruolo === 'personal_trainer',
    isDeveloper: user?.ruolo === 'developer',
    enduranceEnabled, setEnduranceEnabled, dietEnabled, strengthEnabled, progressEnabled, profileComplete, refreshAccountStatus, account, setAccount,
  }), [user, loading, login, register, logout, enduranceEnabled, dietEnabled, strengthEnabled, progressEnabled, profileComplete, refreshAccountStatus, account]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
