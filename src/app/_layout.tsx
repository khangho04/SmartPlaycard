import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ImmersiveController } from '@/components/immersive-controller';
import { AuthProvider } from '@/contexts/auth-context';
import { WalletProvider } from '@/contexts/wallet-context';
import { getDevice } from '@/services/firebase/device-service';

export default function RootLayout() {
  useEffect(() => {
    if (!__DEV__) return;

    // Stage 1: read-only connection check; no realtime listener or database writes.
    async function checkFirebaseConnection() {
      console.log('[Firebase test] Reading /devices/GAME001...');

      try {
        const device: unknown = await getDevice('GAME001');
        if (device === null) {
          console.warn('[Firebase test] Read completed, but /devices/GAME001 does not exist.');
          return;
        }

        console.log('[Firebase test] SUCCESS /devices/GAME001:', device);
      } catch (error: unknown) {
        const code = typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : '';
        const message = error instanceof Error ? error.message : String(error);
        if (/permission[_ -]denied/i.test(`${code} ${message}`)) {
          console.error(
            '[Firebase test] PERMISSION_DENIED /devices/GAME001. Test stopped; Firebase Rules were not changed.',
            error,
          );
          return;
        }

        console.error('[Firebase test] FAILED /devices/GAME001:', error);
      }
    }

    void checkFirebaseConnection();
  }, []);

  return (
    <AuthProvider>
      <WalletProvider>
        <ImmersiveController />
        <StatusBar hidden />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade_from_bottom',
            animationDuration: 320,
          }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="scan"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </WalletProvider>
    </AuthProvider>
  );
}
