import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View, TextInput, type TextInputProps } from 'react-native';
import { FormScrollView } from './keyboard-form';
import { ScreenShell } from './screen-shell';
import { ScreenHeader } from './screen-header';
import { AnimatedPressable } from './animated-pressable';
import { useAuth } from '@/contexts/auth-context';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/hooks/use-theme';
import { Brand } from '@/constants/theme';
import { MenuAction } from './menu-action';

export function UserPage({ title, children }: { title: string; children: ReactNode }) {
  const { role, isReady } = useAuth();
  const { error, refresh } = useWallet();
  const theme = useTheme();
  if (!isReady) return null;
  if (role !== 'user') return <Redirect href={role === 'admin' ? '/admin' : '/login'} />;
  return <ScreenShell><FormScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 100 }}>
    <MenuAction title="Trang chủ" icon="arrow-back" onPress={() => router.replace('/(tabs)')} />
    <ScreenHeader title={title} />
    {error ? <View><Text style={{ color: theme.text }}>{error}</Text><Action title="Thử tải lại" onPress={() => void refresh()} /></View> : null}
    {children}
  </FormScrollView></ScreenShell>;
}
export function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <AnimatedPressable disabled={disabled} accessibilityRole="button" style={{ padding: 12, borderRadius: 12, backgroundColor: Brand.primary, opacity: disabled ? 0.5 : 1 }} onPress={onPress}><Text style={{ color: '#fff', fontWeight: '600' }}>{title}</Text></AnimatedPressable>;
}
export function UserText({ children }: { children: ReactNode }) {
  const theme = useTheme(); return <Text selectable style={{ color: theme.text, lineHeight: 23 }}>{children}</Text>;
}
export function UserBox({ children }: { children: ReactNode }) {
  const theme = useTheme(); return <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 }}>{children}</View>;
}
export function UserInput(props: TextInputProps) {
  const theme = useTheme(); return <TextInput {...props} placeholderTextColor={theme.textSecondary} style={[{ color: theme.text, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 13, minHeight: 48 }, props.style]} />;
}
