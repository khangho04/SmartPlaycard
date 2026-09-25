import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';

export default function Index() {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
