import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, onValue, push, ref, runTransaction, set } from 'firebase/database';

import { database } from './firebase-config';
import { applyTopUp, findReceipt, objectValue, validTopUpAmount, type TopUpRequest } from './money-operation';
import { validateKey } from './record-utils';

const PENDING_KEY = 'smartplaycard.pending-topup.v1';
let busy = false;

function isConnected(): Promise<boolean> {
  // .info belongs to the SDK's local metadata tree. get() sends this path to
  // the server, which rejects it with "Invalid token in path".
  return new Promise((resolve, reject) => {
    onValue(ref(database, '.info/connected'), (snapshot) => {
      resolve(snapshot.val() === true);
    }, reject, { onlyOnce: true });
  });
}

export async function getPendingTopUp(): Promise<TopUpRequest | null> {
  const stored = await AsyncStorage.getItem(PENDING_KEY);
  if (!stored) return null;
  const value = objectValue(JSON.parse(stored));
  if (typeof value.id !== 'string' || typeof value.uid !== 'string' ||
      typeof value.amount !== 'number' || !validTopUpAmount(value.amount) ||
      typeof value.timestamp !== 'number' || !Number.isSafeInteger(value.timestamp) || value.timestamp <= 0) {
    throw new Error('Thông tin lần nạp đang chờ không hợp lệ. Không tạo lần nạp mới.');
  }
  validateKey(value.id);
  validateKey(value.uid);
  return value as TopUpRequest;
}

export async function topUpCard(uid: string, amount: number, expectedRequestId?: string) {
  if (busy) throw new Error('Đang xử lý một lần nạp.');
  busy = true;
  try {
    const key = validateKey(uid);
    if (!validTopUpAmount(amount)) throw new Error('Số tiền phải là số nguyên từ 0đ đến 5.000.000đ.');
    const pending = await getPendingTopUp();
    if (expectedRequestId) validateKey(expectedRequestId);
    if (pending && expectedRequestId && pending.id !== expectedRequestId) throw new Error('Lần nạp đang chờ đã thay đổi. Hãy mở lại màn hình.');
    if (pending && (pending.uid !== key || pending.amount !== amount)) {
      throw new Error(`Hãy kiểm tra lần nạp đang chờ cho thẻ ${pending.uid} trước.`);
    }
    if (!(await isConnected())) throw new Error('Chưa kết nối Firebase.');
    const target = ref(database, `cards/${key}`);
    const existing = await get(target);
    if (!existing.exists()) throw new Error('Không tìm thấy thẻ.');
    const request: TopUpRequest = pending ?? {
      id: expectedRequestId ?? push(ref(database, 'transactions')).key!, uid: key, amount, timestamp: Math.floor(Date.now() / 1000),
    };
    // A screen restored during another in-flight submission can hold a stale
    // pending ID. Reconcile that exact ID; never turn a retry into a new deposit.
    if (expectedRequestId && !pending && !findReceipt(existing.val(), request)) {
      throw new Error('Không tìm thấy biên nhận của lần nạp cần kiểm tra. Chưa tạo lần nạp mới.');
    }
    // Simulation deposits operate on the selected card, independently of GAME001.
    let receipt = findReceipt(existing.val(), request);
    // Validate before persisting a new intent. Never silently replace a pending ID.
    applyTopUp(existing.val(), request);
    if (!pending) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(request));

    if (!receipt) {
      let validationError = '';
      const result = await runTransaction(target, (current: unknown) => {
        try {
          validationError = '';
          return applyTopUp(current, request);
        } catch (error) {
          validationError = error instanceof Error ? error.message : String(error);
          return undefined;
        }
      }, { applyLocally: false });
      if (!result.committed) throw new Error(validationError || 'Lần nạp chưa được xác nhận. Hãy thử lại cùng lần nạp.');
      receipt = findReceipt(result.snapshot.val(), request);
      if (!receipt) throw new Error('Thẻ không còn tồn tại; chưa có biên nhận nạp.');
    }
    // The durable receipt was committed atomically with balance. Publishing history
    // can be retried at this exact ID without crediting the card again.
    await set(ref(database, `transactions/${request.id}`), receipt);
    await AsyncStorage.removeItem(PENDING_KEY);
    return receipt;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission[_ -]denied/i.test(message)) {
      throw new Error('PERMISSION_DENIED: Firebase từ chối thao tác. Đã dừng; không thay đổi Rules.');
    }
    throw error;
  } finally {
    busy = false;
  }
}
