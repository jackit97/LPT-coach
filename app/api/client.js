import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

export const TOKEN_KEY = 'lptcoach_token';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use(async (cfg) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export default api;
