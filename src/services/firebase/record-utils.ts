import { get, onValue, ref } from 'firebase/database';

import { database } from './firebase-config';

type FieldKind = 'string' | 'number' | 'boolean' | 'timestamp';
export type RecordSchema<T> = { [K in keyof T]-?: FieldKind };
export type ReadErrorHandler = (error: Error) => void;

export function validateKey(key: string): string {
  const value = key.trim();
  if (!value || /[.#$\[\]/\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('UID/mã thiết bị không hợp lệ.');
  }
  return value;
}

export function parseRecord<T>(value: unknown, schema: RecordSchema<T>): T | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Dữ liệu Firebase không đúng dạng bản ghi.');
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [field, kind] of Object.entries(schema)) {
    const item = source[field];
    if (item === undefined || item === null) continue;
    const valid = kind === 'timestamp'
      ? typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item))
      : typeof item === kind && (typeof item !== 'number' || Number.isFinite(item));
    if (!valid) throw new Error(`Field Firebase không hợp lệ: ${field}`);
    result[field] = item;
  }
  return result as T;
}

export function reportReadError(error: Error) {
  console.error('[Firebase] Dừng đọc dữ liệu:', error);
}

export function readErrorMessage(error: Error): string {
  return /permission[_ -]denied/i.test(error.message)
    ? 'PERMISSION_DENIED: Firebase từ chối đọc dữ liệu. Đã dừng; không thay đổi Rules.'
    : error.message;
}

export async function readRecord<T>(path: string, schema: RecordSchema<T>): Promise<T | null> {
  const snapshot = await get(ref(database, path));
  return parseRecord<T>(snapshot.val(), schema);
}

export function watchRecord<T>(
  path: string,
  schema: RecordSchema<T>,
  callback: (value: T | null) => void,
  onError: ReadErrorHandler = reportReadError,
): () => void {
  return onValue(ref(database, path), (snapshot) => {
    let value: T | null;
    try {
      value = parseRecord<T>(snapshot.val(), schema);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    callback(value);
  }, onError);
}
