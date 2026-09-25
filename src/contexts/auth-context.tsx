import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

const VALID_USERNAME = 'admin';
const VALID_PASSWORD = '123456';
const SESSION_KEY = 'smartplaycard.session.v1';

type AuthContextValue = {
  isAuthenticated: boolean;
  isReady: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const storedSession = Platform.OS === 'web'
          ? await AsyncStorage.getItem(SESSION_KEY)
          : await SecureStore.getItemAsync(SESSION_KEY);
        if (mounted) {
          setIsAuthenticated(storedSession === 'authenticated');
        }
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      isReady,
      login: async (username: string, password: string) => {
        const success = username === VALID_USERNAME && password === VALID_PASSWORD;
        if (success) {
          if (Platform.OS === 'web') {
            await AsyncStorage.setItem(SESSION_KEY, 'authenticated');
          } else {
            await SecureStore.setItemAsync(SESSION_KEY, 'authenticated');
          }
          setIsAuthenticated(true);
        }
        return success;
      },
      logout: async () => {
        if (Platform.OS === 'web') {
          await AsyncStorage.removeItem(SESSION_KEY);
        } else {
          await SecureStore.deleteItemAsync(SESSION_KEY);
        }
        setIsAuthenticated(false);
      },
    }),
    [isAuthenticated, isReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
