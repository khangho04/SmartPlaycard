import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import { KeyboardForm, FormScrollView } from './keyboard-form';
import { Action, UserBox, UserInput, UserText } from './user-page';
import { useTheme } from '@/hooks/use-theme';
import { errorText } from '@/services/platform';

export function FirstPasswordGate({ children }: { children: ReactNode }) {
  const { isReady, requiresPasswordChange } = useAuth();
  if (!isReady) return null;
  return requiresPasswordChange ? <FirstPasswordChange /> : children;
}

function FirstPasswordChange() {
  const { logout, changePassword } = useAuth();
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (password !== confirmation) throw new Error('Mật khẩu nhập lại chưa khớp.');
      if (password.length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự bất kỳ.');
      await changePassword(null, password);
      setPassword(''); setConfirmation(''); setSaved(true);
      await logout();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardForm><FormScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}><UserBox>
        <UserText>Đổi mật khẩu lần đầu</UserText>
        <UserText>Tài khoản admin có quyền Super Admin cao nhất. Hãy đặt mật khẩu mới để bắt đầu quản trị.</UserText>
        {saved ? <UserText>Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.</UserText> : <>
          <UserInput accessibilityLabel="Mật khẩu mới" placeholder="Mật khẩu mới (ít nhất 6 ký tự bất kỳ)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" autoCapitalize="none" editable={!busy} />
          <UserInput accessibilityLabel="Nhập lại mật khẩu mới" placeholder="Nhập lại mật khẩu mới" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" autoCapitalize="none" editable={!busy} />
          <Action title={busy ? 'Đang lưu...' : 'Đổi mật khẩu và đăng nhập lại'} onPress={() => void save()} disabled={busy || !password || !confirmation} />
        </>}
        {error ? <UserText>{error}</UserText> : null}
        <Action title="Đăng xuất" onPress={() => void logout().catch(e => setError(errorText(e)))} disabled={busy} />
      </UserBox></View>
    </FormScrollView></KeyboardForm>
  </SafeAreaView>;
}
