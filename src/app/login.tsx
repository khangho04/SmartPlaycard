import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { useAuth } from '@/contexts/auth-context';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ERROR_MESSAGE = 'sai tài khoản hoặc mật khẩu, vui lòng nhập lại';

export default function LoginScreen() {
  const theme = useTheme();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const success = await login(username.trim(), password);
    if (success) {
      setError('');
      router.replace('/(tabs)');
      return;
    }
    setError(ERROR_MESSAGE);
  };

  return (
    <LinearGradient colors={[Brand.cardGradientStart, Brand.primaryDark]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}>
          <Animated.View entering={FadeInDown.duration(480).springify()} style={styles.brandBlock}>
            <View style={styles.logoCircle}>
              <Ionicons name="card" size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>SmartPlaycard</Text>
            <Text style={styles.tagline}>Hệ thống thẻ RFID thông minh</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).duration(480).springify()} style={[styles.formCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>Đăng nhập</Text>
            <Text style={[styles.formSubtitle, { color: theme.textSecondary }]}>
              Dùng tài khoản demo để truy cập ứng dụng người dùng.
            </Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: theme.textSecondary }]}>Tên tài khoản</Text>
            <TextInput
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (error) setError('');
              }}
              placeholder="admin"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Mật khẩu</Text>
            <TextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) setError('');
              }}
              placeholder="••••••"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />

            <AnimatedPressable style={styles.loginButton} onPress={() => void handleLogin()}>
              <Text style={styles.loginButtonText}>Đăng nhập</Text>
            </AnimatedPressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  brandBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
  },
  tagline: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  formCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  formSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  errorBanner: {
    backgroundColor: '#DC2626',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  loginButton: {
    backgroundColor: Brand.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
