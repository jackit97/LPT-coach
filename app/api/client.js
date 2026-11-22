import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';
import { checkForUpdate } from '../components/AppUpdater';

export const TOKEN_KEY = 'lptcoach_token';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use(async (cfg) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// "Server error" da solo non dice niente: mostra anche il motivo restituito dal worker (es. colonna mancante)
api.interceptors.response.use((response) => response, (error) => {
  const data = error?.response?.data;
  // errore dal server: controlla subito se e' uscita una versione nuova dell'app (quella vecchia puo' non essere compatibile)
  if (!error?.response || error.response.status >= 500 || error.response.status === 404) checkForUpdate();
  if (data && typeof data === 'object' && data.message === 'Server error' && data.detail) {
    data.message = `Errore del server: ${data.detail}`;
  }
  return Promise.reject(error);
});

export default api;
