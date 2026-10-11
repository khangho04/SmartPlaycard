import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';

export default function Index() {
  const { isAuthenticated, isReady, role } = useAuth();

  if (!isReady) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href={role === 'admin' ? '/admin' : '/(tabs)'} />;
  }

  return <Redirect href="/login" />;
}
