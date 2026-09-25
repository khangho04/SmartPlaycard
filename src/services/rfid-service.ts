import { onValue, ref } from 'firebase/database';

import { getCard, subscribeCard } from './firebase/card-service';
import { getDevice, subscribeDevice } from './firebase/device-service';
import { database } from './firebase/firebase-config';
import { subscribeCardTransactions } from './firebase/transaction-service';
import { readErrorMessage, type ReadErrorHandler } from './firebase/record-utils';
import { getPendingTopUp, topUpCard } from './firebase/topup-service';

export { readErrorMessage };

export type RfidScanResult = {
  uid: string;
  scannedAt: string;
  source: 'api';
};

export interface RfidService {
  topUpCard: typeof topUpCard;
  getPendingTopUp: typeof getPendingTopUp;
  scanCard(): Promise<RfidScanResult>;
  getCard: typeof getCard;
  subscribeCard: typeof subscribeCard;
  getDevice: typeof getDevice;
  subscribeDevice: typeof subscribeDevice;
  subscribeTransactions: typeof subscribeCardTransactions;
  subscribeConnection: (callback: (connected: boolean) => void, onError: ReadErrorHandler) => () => void;
}

const firebaseRfidService: RfidService = {
  topUpCard,
  getPendingTopUp,
  async scanCard() {
    throw new Error('Chưa có giao thức nhận UID quét từ ESP32. Hãy nhập UID thật tại màn hình Thẻ RFID.');
  },
  getCard,
  subscribeCard,
  getDevice,
  subscribeDevice,
  subscribeTransactions: subscribeCardTransactions,
  subscribeConnection(callback, onError) {
    return onValue(ref(database, '.info/connected'), (snapshot) => callback(snapshot.val() === true), onError);
  },
};

let activeRfidService: RfidService = firebaseRfidService;

export function getRfidService() {
  return activeRfidService;
}

export function configureRfidService(service: RfidService) {
  activeRfidService = service;
}
