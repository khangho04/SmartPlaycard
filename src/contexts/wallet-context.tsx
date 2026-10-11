import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { errorText, type UserSnapshot } from '@/services/platform';
import { readUserWallet } from '@/services/firebase/user-wallet';
import { formatFirebaseTime, mapTransaction } from '@/services/wallet-mapping';
function useFirebaseWallet(accountId: string | null) {
  const [uid, setUid] = useState<string | null>(null);
  const [data, setData] = useState<UserSnapshot | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [selectionReady, setSelectionReady] = useState(false);
  const generation = useRef(0);
  const selected = useRef<string | null>(null);
  const accountKey = `smartplaycard.card.${accountId}`;
  useEffect(() => {
    let active = true;
    if (!accountId) return;
    void AsyncStorage.getItem(accountKey).then((stored) => {
      if (active) { selected.current = stored; setUid(stored); setSelectionReady(true); }
    }).catch(() => { if (active) setSelectionReady(true); });
    return () => { active = false; };
  }, [accountId, accountKey]);
  const refresh = useCallback(async () => {
    if (!accountId || !selectionReady) return;
    const request = ++generation.current;
    try {
      const value = await readUserWallet(accountId, selected.current);
      if (request !== generation.current) return;
      setData(value); setConnected(true); setError(''); setReady(true);
    } catch (e) {
      if (request !== generation.current) return;
      setData(null); setConnected(false); setError(errorText(e)); setReady(true);
      if ((e as { code?: string }).code === 'functions/permission-denied' && selected.current) {
        selected.current = null; setUid(null); void AsyncStorage.removeItem(accountKey);
      }
    }
  }, [accountId, selectionReady, accountKey]);
  useEffect(() => {
    const requests = generation;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, 10000); };
    void poll();
    return () => { stopped = true; clearTimeout(timer); requests.current++; };
  }, [refresh, uid]);
  async function selectCard(input: string) {
    if (!accountId) throw new Error('Hãy đăng nhập.');
    const key = input.trim();
    const request = ++generation.current;
    const value = await readUserWallet(accountId, key);
    if (request !== generation.current) throw new Error('Thao tác đã bị hủy.');
    await AsyncStorage.setItem(accountKey, key);
    selected.current = key; setUid(key); setData(value); setConnected(true); setError(''); setReady(true);
  }
  async function clearSelectedCard() {
    generation.current++; selected.current = null; setUid(null); setData(null);
    await AsyncStorage.removeItem(accountKey);
  }
  const card = data?.card || null;
  return {
    uid, card, data, error, connected, isReady: ready, refresh,
    cardMessage: error || (!uid ? 'Nhập UID thẻ để xem số dư và lịch sử giao dịch.' : !ready ? 'Đang tải...' : !card ? 'Chưa có dữ liệu thẻ.' : ''),
    historyMessage: error || (!uid ? 'Chưa chọn thẻ.' : !ready ? 'Đang tải lịch sử...' : ''),
    wallet: { balance: connected ? card?.balance ?? null : null, bonusPoints: null, lastTopUp: formatFirebaseTime(card?.lastTopupAt, card?.lastTopupAtEpoch) },
    transactions: (data?.transactions || []).map(mapTransaction), selectCard, clearSelectedCard,
  };
}
type WalletContextValue = ReturnType<typeof useFirebaseWallet>;
const WalletContext = createContext<WalletContextValue | null>(null);
function WalletSession({ children, accountId }: { children: ReactNode; accountId: string | null }) {
  const value = useFirebaseWallet(accountId);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
export function WalletProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const accountId = role === 'user' ? user?.uid || null : null;
  return <WalletSession key={accountId || 'signed-out'} accountId={accountId}>{children}</WalletSession>;
}
export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error('WalletProvider missing');
  return value;
}
