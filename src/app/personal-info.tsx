import { useState } from 'react';
import { Action, UserBox, UserInput, UserPage, UserText } from '@/components/user-page';
import { useWallet } from '@/contexts/wallet-context';
import { errorText, platformCall, type Profile } from '@/services/platform';
import { accountName } from '@/services/account-identity';
function ProfileForm({ profile }: { profile: Profile }) {
  const { refresh, data } = useWallet(); const [name, setName] = useState(profile.name); const [phone, setPhone] = useState(profile.phone);
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage(''); try { await platformCall('userProfileSave', { name, phone }); setMessage('Đã lưu thông tin cá nhân.'); await refresh(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  return <><UserText>Họ tên</UserText><UserInput value={name} onChangeText={setName} placeholder="Họ tên" maxLength={100} editable={!busy} />
    <UserText>Số điện thoại liên hệ</UserText><UserInput value={phone} onChangeText={setPhone} placeholder="Số điện thoại" keyboardType="phone-pad" maxLength={20} editable={!busy} />
    <UserText>Tên tài khoản: {accountName(profile.email)}</UserText><UserText>Tham gia: {new Date(profile.memberSince).toLocaleDateString('vi-VN')}</UserText>
    <Action title={busy ? 'Đang lưu...' : 'Lưu thông tin'} disabled={busy || !name.trim()} onPress={() => void save()} />
    {message ? <UserText>{message}</UserText> : null}
    <UserBox><UserText>Thẻ đang xem</UserText>{data?.card ? <UserText>{data.card.id} · {data.branches.find((b) => b.id === data.card?.branchId)?.name || 'Chưa xác định chi nhánh'}</UserText> : <UserText>Nhập UID tại màn hình thẻ để xem dữ liệu.</UserText>}</UserBox>
  </>;
}
export default function PersonalInfo() {
  const { data } = useWallet(); return <UserPage title="Thông tin cá nhân">{data ? <ProfileForm profile={data.profile} /> : <UserText>Đang chờ dữ liệu tài khoản...</UserText>}</UserPage>;
}
