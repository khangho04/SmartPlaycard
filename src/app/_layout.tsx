import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ImmersiveController } from '@/components/immersive-controller';
import { AuthProvider } from '@/contexts/auth-context';
import { WalletProvider } from '@/contexts/wallet-context';
import { FirstPasswordGate } from '@/components/first-password-change';
export default function RootLayout() {
  return <AuthProvider><WalletProvider>
    <ImmersiveController /><StatusBar hidden />
    <FirstPasswordGate><Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="login" /><Stack.Screen name="(tabs)" />
    </Stack></FirstPasswordGate>
  </WalletProvider></AuthProvider>;
}
