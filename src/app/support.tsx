import { useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Action, UserBox, UserInput, UserPage, UserText } from '@/components/user-page';
import { useWallet } from '@/contexts/wallet-context';
import { errorText, platformCall, ticketStatus } from '@/services/platform';
export default function Support() {
  const { data, uid, refresh } = useWallet(); const params = useLocalSearchParams<{ gameId?: string }>();
  const [category, setCategory] = useState(params.gameId ? 'game' : 'other'); const [title, setTitle] = useState(''); const [message, setMessage] = useState('');
  const [notice, setNotice] = useState(''); const [pending, setPending] = useState(false); const [busy, setBusy] = useState(false);
  const intent = useRef<{ id: string; payload: unknown } | null>(null);
  async function send() {
    if (busy) return; setBusy(true); setNotice('');
    try {
      // Keep identical ID/payload on uncertain retries; fields stay locked until confirmed.
      intent.current ||= { id: `support-${Date.now()}-${Math.random().toString(36).slice(2)}`, payload: { title, message, category, cardUid: uid || '', gameId: params.gameId || '' } };
      setPending(true);
      const result = await platformCall<{ id: string }>('userSupportCreate', { ...(intent.current.payload as object), id: intent.current.id });
      intent.current = null; setPending(false); setTitle(''); setMessage(''); setNotice(`Đã gửi yêu cầu ${result.id}.`); await refresh();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (['functions/invalid-argument', 'functions/permission-denied', 'functions/failed-precondition'].includes(code || '')) {
        intent.current = null; setPending(false);
      }
      setNotice(errorText(e));
    } finally { setBusy(false); }
  }
  async function call(phone: string) { try { await Linking.openURL(`tel:${phone}`); } catch { setNotice(`Không mở được cuộc gọi. Vui lòng gọi ${phone}.`); } }
  async function copy(phone: string) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(phone); setNotice('Đã sao chép số điện thoại.'); } catch { setNotice(`Số liên hệ: ${phone}`); }
    } else setNotice(`Nhấn giữ số để sao chép: ${phone}`);
  }
  return <UserPage title="Trung tâm hỗ trợ"><UserBox><UserText>Liên hệ quản trị</UserText>{['0794088678', '0708348573'].map((phone) => <UserBox key={phone}><UserText>{phone}</UserText><Action title={`Gọi ${phone}`} onPress={() => void call(phone)} /><Action title="Sao chép số" onPress={() => void copy(phone)} /></UserBox>)}</UserBox>
    <UserText>Gửi yêu cầu hỗ trợ. Không gửi mật khẩu, OTP hoặc thông tin thanh toán nhạy cảm.</UserText>
    <UserText>Thẻ: {uid || 'Chưa chọn'}{params.gameId ? ` · Game: ${data?.games.find((g) => g.id === params.gameId)?.name || params.gameId}` : ''}</UserText>
    {Object.entries({ card: 'Thẻ', topup: 'Nạp tiền', game: 'Trò chơi', other: 'Vấn đề khác' }).map(([key, label]) => <Action key={key} title={`${category === key ? '✓ ' : ''}${label}`} disabled={busy || pending} onPress={() => setCategory(key)} />)}
    <UserInput value={title} onChangeText={setTitle} placeholder="Tiêu đề" maxLength={120} editable={!busy && !pending} />
    <UserInput value={message} onChangeText={setMessage} placeholder="Mô tả vấn đề, thời điểm và mã giao dịch nếu có" multiline maxLength={2000} style={{ minHeight: 120 }} editable={!busy && !pending} />
    <Action title={busy ? 'Đang gửi...' : pending ? 'Thử gửi lại yêu cầu' : 'Gửi yêu cầu'} disabled={busy || !title.trim() || !message.trim()} onPress={() => void send()} />
    {notice ? <UserText>{notice}</UserText> : null}
    <UserText>Yêu cầu của tôi</UserText>{!data?.tickets.length ? <UserText>Chưa có yêu cầu hỗ trợ.</UserText> : null}
    {data?.tickets.map((t) => <UserBox key={t.id}><UserText>{t.title} · {ticketStatus[t.status]}</UserText><UserText>{t.message}</UserText><UserText>Mã: {t.id} · {new Date(t.updatedAt).toLocaleString('vi-VN')}</UserText><UserText>{t.reply ? `Admin: ${t.reply}` : 'Đang chờ phản hồi từ nhân viên.'}</UserText></UserBox>)}
  </UserPage>;
}
