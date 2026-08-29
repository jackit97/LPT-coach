import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

// Holds which athlete a coach is currently viewing across all tabs
// (Calendario, Diete, Pagamenti, Endurance). Athletes just use their own id.
const AthleteContext = createContext(null);

export function AthleteProvider({ children }) {
  const { user, isCoach } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [loadingClients, setLoadingClients] = useState(false);

  const loadClients = useCallback(async () => {
    if (!isCoach) return;
    setLoadingClients(true);
    try {
      const { data } = await api.get('/users/clients');
      setClients(data || []);
      setSelectedAthlete((prev) => prev || data?.[0] || null);
    } finally {
      setLoadingClients(false);
    }
  }, [isCoach]);

  useEffect(() => {
    if (isCoach) loadClients();
    else setSelectedAthlete(null);
  }, [isCoach, loadClients]);

  const targetUserId = isCoach ? selectedAthlete?.utenteid : user?.id;

  const value = useMemo(
    () => ({ clients, selectedAthlete, setSelectedAthlete, loadingClients, loadClients, targetUserId }),
    [clients, selectedAthlete, loadingClients, loadClients, targetUserId]
  );

  return <AthleteContext.Provider value={value}>{children}</AthleteContext.Provider>;
}

export function useAthlete() {
  const ctx = useContext(AthleteContext);
  if (!ctx) throw new Error('useAthlete must be used within AthleteProvider');
  return ctx;
}
