import type { Device } from './firebase-types';
import { readRecord, validateKey, watchRecord, type ReadErrorHandler, type RecordSchema } from './record-utils';

const deviceSchema: RecordSchema<Device> = {
  balanceProtocolVersion: 'number',
  name: 'string', price: 'number', gameDurationSeconds: 'number', status: 'string',
  mode: 'string', ipAddress: 'string', wifiRSSI: 'number', bootAt: 'string',
  lastSeen: 'string', lastSeenEpoch: 'number', statusUpdatedAt: 'string', statusUpdatedAtEpoch: 'number',
};

export function getDevice(deviceId = 'GAME001'): Promise<Device | null> {
  return readRecord<Device>(`devices/${validateKey(deviceId)}`, deviceSchema);
}

export function subscribeDevice(
  deviceId: string,
  callback: (device: Device | null) => void,
  onError?: ReadErrorHandler,
) {
  return watchRecord<Device>(`devices/${validateKey(deviceId)}`, deviceSchema, callback, onError);
}
