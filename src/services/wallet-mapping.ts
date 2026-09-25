import type { Card, FirebaseTimestamp } from './firebase/firebase-types';
import type { CardTransaction } from './firebase/transaction-service';

export type HistoryItem = {
  id: string;
  type: 'play' | 'topup' | 'refund' | 'bonus' | 'unknown';
  title: string;
  subtitle: string;
  amount: number | null;
  time: string;
};

export function formatBalance(amount: number | null | undefined): string {
  return typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString('vi-VN')}đ` : '—';
}

export function formatFirebaseTime(value?: FirebaseTimestamp, epochSeconds?: number): string {
  const formatDate = (date: Date) => date.toLocaleString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const seconds = epochSeconds ?? (typeof value === 'number' ? value : undefined);
  if (seconds !== undefined && seconds > 0) {
    // Firmware/app epochs use seconds; also accept Firebase millisecond epochs.
    const date = new Date(seconds >= 1e12 ? seconds : seconds * 1000);
    if (Number.isFinite(date.getTime())) return formatDate(date);
  }
  if (typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return formatDate(date);
  }
  // Display firmware text verbatim: its timezone has not been specified.
  if (typeof value === 'string' && value && value !== 'TIME_NOT_SYNCED') return value;
  return 'Chưa có thời gian hợp lệ';
}

export function mapTransaction(record: CardTransaction): HistoryItem {
  const kind = record.type?.toUpperCase();
  const type = kind === 'PLAY' ? 'play' : kind === 'TOPUP' ? 'topup' : 'unknown';
  // Prefer the recorded balance delta, never perform or repeat a transaction.
  const amount = record.balanceBefore !== undefined && record.balanceAfter !== undefined
    ? record.balanceAfter - record.balanceBefore
    : record.amount === undefined ? null
      : type === 'play' ? -Math.abs(record.amount)
        : type === 'topup' ? Math.abs(record.amount) : record.amount;
  return {
    id: record.id, type, amount,
    title: type === 'play' ? 'Chơi game' : type === 'topup' ? 'Nạp tiền' : `Giao dịch ${record.type ?? 'chưa rõ loại'}`,
    subtitle: [record.deviceId, record.cardName ?? record.uid].filter(Boolean).join(' • '),
    time: formatFirebaseTime(record.time ?? record.timestamp, typeof record.timestamp === 'number' ? record.timestamp : undefined),
  };
}

export function cardStatus(card: Card | null): string {
  return card?.active === true ? 'Đang hoạt động' : card?.active === false ? 'Đã khóa' : 'Chưa rõ trạng thái';
}
