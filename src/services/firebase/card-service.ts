import type { Card } from './firebase-types';
import { readRecord, validateKey, watchRecord, type ReadErrorHandler, type RecordSchema } from './record-utils';

const cardSchema: RecordSchema<Card> = {
  uid: 'string', name: 'string', balance: 'number', active: 'boolean',
  playCount: 'number', topupCount: 'number', totalSpent: 'number', totalTopup: 'number',
  lastPlayedAt: 'timestamp', lastTopupAt: 'timestamp', lastPlayedAtEpoch: 'number',
  lastTopupAtEpoch: 'number', updatedAt: 'string', updatedAtEpoch: 'number',
};

export function getCard(uid: string): Promise<Card | null> {
  return readRecord<Card>(`cards/${validateKey(uid)}`, cardSchema);
}

export function subscribeCard(uid: string, callback: (card: Card | null) => void, onError?: ReadErrorHandler) {
  return watchRecord<Card>(`cards/${validateKey(uid)}`, cardSchema, callback, onError);
}
