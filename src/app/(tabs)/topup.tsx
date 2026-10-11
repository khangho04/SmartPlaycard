import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/auth-context';
import { randomUUID } from 'expo-crypto';
import { Action, UserBox, UserInput, UserText } from '@/components/user-page';
import { errorText, platformCall } from '@/services/platform';
import { MenuAction } from '@/components/menu-action';
import { FormScrollView } from '@/components/keyboard-form';
import { ScreenShell } from '@/components/screen-shell';
import { ScreenHeader } from '@/components/screen-header';
import { useWallet } from '@/contexts/wallet-context';
import { formatBalance } from '@/services/wallet-mapping';
export default function TopUp() {
  const { uid, wallet, data, cardMessage, refresh, connected } = useWallet();
  const [amount, setAmount] = useState('50000');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ cardUid: string; amount: number; requestId: string } | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const { user } = useAuth();
  const storageKey = `smartplaycard.topup.pending.${user?.uid}`;
  const ready = loadedKey === storageKey;
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then(stored => {
      if (!active) return;
      const request = stored ? JSON.parse(stored) : null;
      if (request && (typeof request.cardUid !== 'string' || typeof request.requestId !== 'string' || !Number.isSafeInteger(request.amount) || request.amount < 1 || request.amount > 5000000)) throw new Error('Giao dịch lưu trên máy không hợp lệ.');
      setPending(request); setLoadedKey(storageKey);
    }).catch(error => { if (active) setMessage(errorText(error)); });
    return () => { active = false; };
  }, [storageKey]);
  async function topUp() {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const value = Number(amount);
      if (!pending && (!uid || !connected || !data?.card)) throw new Error('Nhập UID và tải dữ liệu thẻ trước khi nạp.');
      if (!pending && (!/^\d+$/.test(amount) || !Number.isSafeInteger(value) || value < 1 || value > 5000000)) throw new Error('Nhập số tiền từ 1 đến 5.000.000 đồng.');
      const request = pending || { cardUid: uid!, amount: value, requestId: randomUUID() };
      await AsyncStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await platformCall('userTopUp', request);
      await AsyncStorage.removeItem(storageKey);
      setPending(null);
      setMessage(`Đã nạp ${formatBalance(request.amount)} vào thẻ ${request.cardUid}.`);
      await refresh();
    } catch (error) { setMessage(errorText(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  const branch = data?.branches.find((b) => b.id === data.card?.branchId);
  return <ScreenShell><FormScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 110 }}>
    <ScreenHeader title="Nạp tiền" subtitle="Nạp vào thẻ theo UID ngay trên app." />
    <UserBox><UserText>Thẻ: {uid || 'Chưa chọn'}</UserText><UserText>Số dư: {formatBalance(wallet.balance)}</UserText><UserText>Chi nhánh: {branch?.name || 'Chưa xác định'}</UserText>{cardMessage ? <UserText>{cardMessage}</UserText> : null}</UserBox>
    <UserText>Nạp tiền demo: số tiền được cộng trực tiếp vào thẻ, không thực hiện thanh toán ngân hàng.</UserText>
    <UserBox>
      <UserText>Số tiền nạp (đồng)</UserText>
      {[10000, 20000, 50000, 100000, 200000, 500000].map(value => <Action key={value} title={`${amount === String(value) ? '✓ ' : ''}${formatBalance(value)}`} disabled={busy || !!pending} onPress={() => setAmount(String(value))} />)}
      <UserInput accessibilityLabel="Số tiền nạp" placeholder="Nhập số tiền khác" keyboardType="number-pad" value={amount} onChangeText={setAmount} editable={!busy && !pending} />
      <UserText>{pending ? `Thử lại giao dịch ${formatBalance(pending.amount)} cho thẻ ${pending.cardUid}.` : `Nạp ${formatBalance(Number(amount) || 0)} vào thẻ ${uid || 'chưa nhập UID'}.`}</UserText>
      <Action title={busy ? 'Đang nạp...' : pending ? 'Thử lại giao dịch nạp' : 'Xác nhận nạp tiền'} disabled={busy || !ready || (!pending && (!uid || !connected || !data?.card))} onPress={() => void topUp()} />
      {message ? <UserText>{message}</UserText> : null}
    </UserBox>
    <UserBox>
    <MenuAction title="Nhập UID thẻ" icon="card-outline" onPress={() => router.push('/card')} />
    <MenuAction title="Lịch sử nạp tiền" icon="time-outline" onPress={() => router.push('/history')} />
    <MenuAction title="Hỗ trợ nạp tiền" icon="help-circle-outline" onPress={() => router.push('/support')} />
    </UserBox>
  </FormScrollView></ScreenShell>;
}
