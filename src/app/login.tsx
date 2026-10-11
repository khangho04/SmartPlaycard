import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { KeyboardForm, FormScrollView } from '@/components/keyboard-form';
import { useAuth } from '@/contexts/auth-context';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorText } from '@/services/platform';

export default function LoginScreen() {
  const theme = useTheme();
  const { login, register, role, isReady, error: sessionError, retry, logout } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async () => {
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      if (registering) {
        if (password !== confirmation) throw new Error('Mật khẩu nhập lại chưa khớp.');
        await register(username, password);
        setRegistering(false); setPassword(''); setConfirmation('');
        setSuccess('Tạo tài khoản thành công. Hãy đăng nhập.');
      } else await login(username, password);
    }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  if (isReady && role) return <Redirect href={role === 'admin' ? '/admin' : '/(tabs)'} />;

  return (
    <LinearGradient colors={[Brand.primaryDark, Brand.primaryDark]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <KeyboardForm>
          <FormScrollView contentContainerStyle={styles.keyboard}>
          <Animated.View entering={FadeInDown.duration(480).springify()} style={styles.brandBlock}>
            <View style={styles.logoCircle}>
              <Ionicons name="card-outline" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>SmartPlaycard</Text>
            <Text style={styles.tagline}>Thẻ của bạn, niềm vui của bạn</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).duration(480).springify()} style={[styles.formCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>{registering ? 'Tạo tài khoản' : 'Đăng nhập'}</Text>
            <Text style={[styles.formSubtitle, { color: theme.textSecondary }]}>
              {registering ? 'Chọn tên tài khoản và mật khẩu để tạo tài khoản mới.' : 'Đăng nhập bằng tên tài khoản và mật khẩu của bạn.'}
            </Text>

            {success ? <Text style={{ color: theme.text }}>{success}</Text> : null}
            {error || sessionError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error || sessionError}</Text>
              </View>
            ) : null}

            {sessionError ? <><AnimatedPressable onPress={retry}><Text style={{ color: Brand.primary }}>Thử kết nối lại</Text></AnimatedPressable><AnimatedPressable onPress={() => void logout()}><Text style={{ color: Brand.primary }}>Đăng nhập tài khoản khác</Text></AnimatedPressable></> : null}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Tên tài khoản</Text>
            <TextInput
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (error) setError('');
              }}
              placeholder="Nhập tên tài khoản"
              editable={!busy && isReady}
              autoComplete="username"
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
              editable={!busy && isReady}
              autoComplete={registering ? 'new-password' : 'current-password'}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />

            {registering ? <><Text style={[styles.label, { color: theme.textSecondary }]}>Nhập lại mật khẩu</Text><TextInput value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" editable={!busy && isReady} placeholder="Nhập lại mật khẩu" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} /><Text style={{ color: theme.textSecondary }}>Tên gồm 3–32 ký tự chữ không dấu, số, dấu _. Mật khẩu ít nhất 6 ký tự bất kỳ.</Text></> : null}
            <AnimatedPressable disabled={busy || !isReady || !username.trim() || !password} style={styles.loginButton} onPress={() => void handleLogin()}>
              <Text style={styles.loginButtonText}>{busy || !isReady ? 'Đang kết nối...' : registering ? 'Tạo tài khoản' : 'Đăng nhập'}</Text>
            </AnimatedPressable>
            <AnimatedPressable disabled={busy || !isReady || !!sessionError} onPress={() => { setRegistering((v) => !v); setError(''); setSuccess(''); setPassword(''); setConfirmation(''); }}><Text style={{ color: Brand.primary, textAlign: 'center', paddingVertical: 12 }}>{registering ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo tài khoản'}</Text></AnimatedPressable>
            {!registering ? <Text style={{ color: theme.textSecondary }}>Quên mật khẩu? Liên hệ trung tâm hỗ trợ: 0794088678 hoặc 0708348573.</Text> : null}
          </Animated.View>
          </FormScrollView>
        </KeyboardForm>
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
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.md,
    gap: Spacing.lg,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  tagline: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  formCard: {
    borderRadius: Radius.md,
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
