import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { changeDatabasePassword, loginDatabase, logoutDatabase, registerDatabase, restoreDatabaseSession, subscribeAuth, type DatabaseUser } from '@/services/firebase/rtdb-auth';
import { errorText } from '@/services/service-error';
type AuthContextValue = {
  user: DatabaseUser | null; role: 'admin' | 'user' | null; isAuthenticated: boolean; isReady: boolean;
  error: string; retry: () => void; requiresPasswordChange: boolean;
  login: (username: string, password: string) => Promise<boolean>; logout: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  changePassword: (current: string | null, password: string) => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DatabaseUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const stop = subscribeAuth(value => { if (active) setUser(value); });
    void restoreDatabaseSession().then(() => { if (active) { setReady(true); setError(''); } }).catch(e => { if (active) { setReady(true); setError(errorText(e)); } });
    return () => { active = false; stop(); };
  }, [version]);
  const value = useMemo<AuthContextValue>(() => ({
    user, role: user?.access || null, isReady: ready, error, isAuthenticated: !!user,
    requiresPasswordChange: user?.requiresPasswordChange === true,
    retry: () => { setReady(false); setVersion(v => v + 1); },
    login: loginDatabase, register: registerDatabase, logout: logoutDatabase, changePassword: changeDatabasePassword,
  }), [user, ready, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
