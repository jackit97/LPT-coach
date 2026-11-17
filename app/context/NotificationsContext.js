import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import api from '../api/client';
import { useAuth } from './AuthContext';

// Conteggio notifiche non lette condiviso tra campanella e schermata Notifiche.
const NotificationsContext = createContext({ unread: 0, refresh: () => {}, setUnread: () => {} });
const POLL_MS = 60 * 1000;

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnread(data?.unread || 0);
    } catch { /* offline o migration non applicata */ }
  }, [user]);

  useEffect(() => {
    if (!user) { setUnread(0); return undefined; }
    refresh();
    const timer = setInterval(() => {
      const hidden = Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (!hidden) refresh();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refresh]);

  // Badge sull'icona dell'app installata (dove il browser lo supporta)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    try {
      if (unread > 0 && navigator.setAppBadge) navigator.setAppBadge(unread);
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch { /* ignore */ }
  }, [unread]);

  const value = useMemo(() => ({ unread, refresh, setUnread }), [unread, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
