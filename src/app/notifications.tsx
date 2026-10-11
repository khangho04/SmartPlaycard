import { useState } from 'react';
import { router } from 'expo-router';
import { Action, UserBox, UserPage, UserText } from '@/components/user-page';
import { useWallet } from '@/contexts/wallet-context';
import { errorText, platformCall } from '@/services/platform';
export default function Notifications() {
  const { data, refresh, isReady } = useWallet(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function read(id: string) {
    setBusy(true); try { await platformCall('userNoticeRead', { id }); await refresh(); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  return <UserPage title="Thông báo"><UserText>100 thông báo gần nhất. Tự cập nhật khi app đang mở.</UserText>
    {message ? <UserText>{message}</UserText> : null}
    {!isReady ? <UserText>Đang tải...</UserText> : !data?.notifications.length ? <UserText>Chưa có thông báo.</UserText> : null}
    {data?.notifications.map((n) => <UserBox key={n.id}><UserText>{!n.read ? '● ' : ''}{n.title}</UserText><UserText>{n.message}</UserText><UserText>{new Date(n.createdAt).toLocaleString('vi-VN')}</UserText>
      {!n.read ? <Action title="Đánh dấu đã đọc" disabled={busy} onPress={() => void read(n.id)} /> : null}
      {n.ticketId ? <Action title="Xem yêu cầu hỗ trợ" onPress={() => router.push('/support')} /> : null}
    </UserBox>)}
  </UserPage>;
}
