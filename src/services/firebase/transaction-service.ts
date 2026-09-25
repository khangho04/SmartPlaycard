import { equalTo, get, onValue, orderByChild, query, ref, type DataSnapshot } from 'firebase/database';

import { database } from './firebase-config';
import type { Transaction } from './firebase-types';
import { parseRecord, reportReadError, validateKey, type ReadErrorHandler, type RecordSchema } from './record-utils';

export type CardTransaction = Transaction & { id: string };

const transactionSchema: RecordSchema<Transaction> = {
  uid: 'string', type: 'string', amount: 'number', balanceBefore: 'number',
  balanceAfter: 'number', deviceId: 'string', timestamp: 'timestamp',
  time: 'string', cardName: 'string',
};

function cardQuery(uid: string) {
  // Without a uid index the SDK may download/filter more data. Never change Rules here.
  return query(ref(database, 'transactions'), orderByChild('uid'), equalTo(validateKey(uid)));
}

function readTransactions(snapshot: DataSnapshot, uid: string): CardTransaction[] {
  const records: CardTransaction[] = [];
  snapshot.forEach((child) => {
    const transaction = parseRecord<Transaction>(child.val(), transactionSchema);
    if (transaction?.uid === uid && child.key) records.push({ ...transaction, id: child.key });
  });
  // Observed firmware timestamp is Unix seconds. Push key is the fallback order.
  return records.sort((a, b) => {
    const aTime = typeof a.timestamp === 'number' && a.timestamp > 0 ? a.timestamp : 0;
    const bTime = typeof b.timestamp === 'number' && b.timestamp > 0 ? b.timestamp : 0;
    return bTime - aTime || b.id.localeCompare(a.id);
  });
}

export async function getCardTransactions(uid: string): Promise<CardTransaction[]> {
  const key = validateKey(uid);
  return readTransactions(await get(cardQuery(key)), key);
}

export function subscribeCardTransactions(
  uid: string,
  callback: (transactions: CardTransaction[]) => void,
  onError: ReadErrorHandler = reportReadError,
) {
  const key = validateKey(uid);
  return onValue(cardQuery(key), (snapshot) => {
    let records: CardTransaction[];
    try {
      records = readTransactions(snapshot, key);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    callback(records);
  }, onError);
}
