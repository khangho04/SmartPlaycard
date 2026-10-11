import { router } from 'expo-router';
import { useState } from 'react';
import { Action, UserBox, UserInput, UserText } from '@/components/user-page';
import { FormScrollView } from '@/components/keyboard-form';
import { ScreenShell } from '@/components/screen-shell';
import { ScreenHeader } from '@/components/screen-header';
import { useWallet } from '@/contexts/wallet-context';
import { useAuth } from '@/contexts/auth-context';
import { accountName } from '@/services/account-identity';
import { errorText } from '@/services/platform';
import { MenuAction } from '@/components/menu-action';
export default function ProfileScreen() {
  const { data, clearSelectedCard } = useWallet(); const { logout, user, changePassword: savePassword } = useAuth();
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function changePassword() {
    if (busy || !user?.email) return;
    setBusy(true); setMessage('');
    try {
      if (newPassword.length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự bất kỳ.');
      if (newPassword !== confirmation) throw new Error('Mật khẩu nhập lại chưa khớp.');
      await savePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setChangingPassword(false); setMessage('Đã đổi mật khẩu. Hãy đăng nhập lại.');
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  async function exit() { try { await logout(); router.replace('/login'); } catch (e) { setMessage(errorText(e)); } }
  return <ScreenShell><FormScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 110 }}>
    <ScreenHeader title="Cá nhân" />
    <UserBox><UserText>{data?.profile.name || accountName(user?.email) || 'Tài khoản của tôi'}</UserText><UserText>Tài khoản: {accountName(user?.email)}</UserText><UserText>{data?.profile.phone || 'Chưa có số liên hệ'}</UserText></UserBox>
    <UserBox>
    <MenuAction title="Thông tin cá nhân" icon="person-outline" onPress={() => router.push('/personal-info')} />
    <MenuAction title="Đổi mật khẩu" icon="lock-closed-outline" disabled={busy || !user?.email} onPress={() => { setChangingPassword((v) => !v); setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setMessage(''); }} />
    </UserBox>
    {changingPassword ? <UserBox><UserInput placeholder="Mật khẩu hiện tại" secureTextEntry autoComplete="current-password" value={currentPassword} onChangeText={setCurrentPassword} editable={!busy} /><UserInput placeholder="Mật khẩu mới (ít nhất 6 ký tự bất kỳ)" secureTextEntry autoComplete="new-password" value={newPassword} onChangeText={setNewPassword} editable={!busy} /><UserInput placeholder="Nhập lại mật khẩu mới" secureTextEntry autoComplete="new-password" value={confirmation} onChangeText={setConfirmation} editable={!busy} /><Action title={busy ? 'Đang đổi...' : 'Lưu mật khẩu mới'} disabled={busy || !currentPassword || !newPassword || !confirmation} onPress={() => void changePassword()} /></UserBox> : null}
    <UserBox>
    <MenuAction title="Thông báo" icon="notifications-outline" onPress={() => router.push('/notifications')} />
    <MenuAction title="Trung tâm hỗ trợ" icon="help-circle-outline" onPress={() => router.push('/support')} />
    <MenuAction title="Điều khoản sử dụng" icon="document-text-outline" onPress={() => router.push('/terms')} />
    </UserBox>
    <UserBox>
    <MenuAction title="Bỏ chọn thẻ" icon="card-outline" onPress={() => { void clearSelectedCard().catch((e) => setMessage(errorText(e))); }} />
    <MenuAction title="Đăng xuất" icon="log-out-outline" destructive onPress={() => void exit()} />
    </UserBox>
    {message ? <UserText>{message}</UserText> : null}
  </FormScrollView></ScreenShell>;
}
