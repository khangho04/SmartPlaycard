import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from './auth-context';
import type { Card, Device } from '@/services/firebase/firebase-types';
import type { CardTransaction } from '@/services/firebase/transaction-service';
import { validateKey } from '@/services/firebase/record-utils';
import { getRfidService, readErrorMessage } from '@/services/rfid-service';
import { formatFirebaseTime, mapTransaction } from '@/services/wallet-mapping';

const UID_KEY = 'smartplaycard.selected-card-uid.v1';

function useFirebaseWallet(isAuthenticated: boolean) {
  const [uid, setUid] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [records, setRecords] = useState<CardTransaction[]>([]);
  const [cardError, setCardError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [cardReady, setCardReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const selection = useRef({ version: 0, active: true });
  const listenerGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    const request = selection.current;
    request.active = true;
    const version = ++request.version;
    if (isAuthenticated) {
      void AsyncStorage.getItem(UID_KEY).then((stored) => {
        if (active && request.version === version && stored) setUid(validateKey(stored));
      }).catch((error: unknown) => {
        if (active) setCardError(error instanceof Error ? error.message : String(error));
      });
    }
    return () => { active = false; request.active = false; request.version++; };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const service = getRfidService();
    const fail = (error: Error) => {
      if (!active) return;
      setDevice(null);
      setDeviceReady(true);
      setDeviceError(readErrorMessage(error));
      console.error('[Firebase device]', error);
    };
    const stopConnection = service.subscribeConnection((value) => {
      if (active) setConnected(value);
    }, fail);
    const stopDevice = service.subscribeDevice('GAME001', (value) => {
      if (!active) return;
      setDevice(value);
      setDeviceReady(true);
      setDeviceError('');
    }, fail);
    return () => { active = false; stopConnection(); stopDevice(); };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !uid) return;
    let active = true;
    const generation = listenerGeneration.current;
    const isCurrent = () => active && generation === listenerGeneration.current;
    const service = getRfidService();
    const stopCard = service.subscribeCard(uid, (value) => {
      if (!isCurrent()) return;
      setCard(value);
      setCardReady(true);
      setCardError('');
    }, (error) => {
      if (!isCurrent()) return;
      setCard(null);
      setCardReady(true);
      setCardError(readErrorMessage(error));
      console.error('[Firebase card]', error);
    });
    const stopHistory = service.subscribeTransactions(uid, (value) => {
      if (!isCurrent()) return;
      setRecords(value);
      setHistoryReady(true);
      setHistoryError('');
    }, (error) => {
      if (!isCurrent()) return;
      setRecords([]);
      setHistoryReady(true);
      setHistoryError(readErrorMessage(error));
      console.error('[Firebase history]', error);
    });
    return () => { active = false; stopCard(); stopHistory(); };
  }, [isAuthenticated, uid, subscriptionVersion]);

  async function selectCard(input: string) {
    const key = validateKey(input);
    if (!isAuthenticated) throw new Error('Hãy đăng nhập trước khi chọn thẻ.');
    const request = selection.current;
    const version = ++request.version;
    const value = await getRfidService().getCard(key);
    if (!request.active || version !== request.version) throw new Error('Thao tác chọn thẻ đã bị hủy.');
    if (!value) throw new Error('Không tìm thấy thẻ trên Firebase. Kiểm tra UID chính xác.');
    // Persist only a local selection preference, never balance or transactions.
    await AsyncStorage.setItem(UID_KEY, key);
    if (!request.active || version !== request.version) throw new Error('Thao tác chọn thẻ đã bị hủy.');
    listenerGeneration.current++;
    setCard(null);
    setRecords([]);
    setCardReady(false);
    setHistoryReady(false);
    setCardError('');
    setHistoryError('');
    setUid(key);
    setSubscriptionVersion((value) => value + 1);
  }

  async function clearSelectedCard() {
    ++selection.current.version;
    listenerGeneration.current++;
    setUid(null);
    setCard(null);
    setRecords([]);
    setCardError('');
    setHistoryError('');
    await AsyncStorage.removeItem(UID_KEY);
  }

  const visibleCard = isAuthenticated && uid ? card : null;
  const cardMessage = !isAuthenticated ? 'Hãy đăng nhập.'
    : cardError || (!uid ? 'Chưa chọn thẻ. Nhập UID tại màn hình Thẻ RFID.'
      : !connected ? 'Chưa kết nối Firebase. Đang chờ kết nối...'
        : !cardReady ? 'Đang đọc thẻ...'
          : !card ? 'Không tìm thấy thẻ trên Firebase.'
            : card.balance === undefined ? 'Thẻ chưa có dữ liệu số dư.' : '');
  const historyMessage = historyError || (!uid ? 'Chưa chọn thẻ.'
    : !connected ? 'Chưa kết nối Firebase.'
      : !historyReady ? 'Đang tải lịch sử...' : '');
  const deviceMessage = deviceError || (!connected ? 'Chưa kết nối Firebase.'
    : !deviceReady ? 'Đang tải GAME001...' : !device ? 'Không tìm thấy GAME001.' : '');

  return {
    uid: isAuthenticated ? uid : null,
    card: visibleCard,
    device: isAuthenticated ? device : null,
    connected, cardMessage, historyMessage, deviceMessage,
    isReady: cardReady && historyReady,
    wallet: {
      balance: connected && !cardError ? visibleCard?.balance ?? null : null,
      bonusPoints: null,
      lastTopUp: formatFirebaseTime(visibleCard?.lastTopupAt, visibleCard?.lastTopupAtEpoch),
    },
    transactions: useMemo(() => isAuthenticated && uid ? records.map(mapTransaction) : [], [isAuthenticated, uid, records]),
    selectCard,
    clearSelectedCard,
  };
}

type WalletContextValue = ReturnType<typeof useFirebaseWallet>;
const WalletContext = createContext<WalletContextValue | null>(null);

function WalletSession({ children, authenticated }: { children: ReactNode; authenticated: boolean }) {
  const value = useFirebaseWallet(authenticated);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  // A new auth session owns fresh state and listeners; logout discards old data.
  return <WalletSession key={String(isAuthenticated)} authenticated={isAuthenticated}>{children}</WalletSession>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}
