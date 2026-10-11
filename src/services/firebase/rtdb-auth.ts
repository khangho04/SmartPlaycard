import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytesAsync, randomUUID } from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { equalTo, get, onValue, orderByChild, query, ref, runTransaction } from 'firebase/database';
import { database } from './firebase-config';
import { accountEmail, accountName } from '../account-identity';
import type { AdminRole } from '../admin/model';

export interface PasswordRecord { algorithm: 'pbkdf2-sha256'; salt: string; hash: string; iterations: number; version: string }
export interface AccountRecord {
  username: string; createdAt: string; access: 'admin' | 'user'; card: string | Record<string, boolean>;
  credential?: PasswordRecord; isDefaultAdmin?: boolean; requiresPasswordChange?: boolean;
  adminRole?: AdminRole; branchId?: string; disabled?: boolean;
}
export interface DatabaseUser {
  uid: string; username: string; email: string; access: 'admin' | 'user';
  requiresPasswordChange: boolean; isDefaultAdmin: boolean; adminRole: AdminRole; branchId: string;
}
type Session = { uid: string; version: string; expiresAt: number };
const STORAGE = 'smartplaycard.rtdb.session.v1';
const listeners = new Set<(user: DatabaseUser | null) => void>();
let currentUser: DatabaseUser | null = null;
let activeSession: Session | null = null;
let stop: (() => void) | null = null;
let generation = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
export const auth = { get currentUser() { return currentUser; } };
function emit(user: DatabaseUser | null) { currentUser = user; for (const listener of listeners) listener(user); }
export function subscribeAuth(listener: (user: DatabaseUser | null) => void) { listeners.add(listener); listener(currentUser); return () => { listeners.delete(listener); }; }
function invalidLogin(): never { throw Object.assign(new Error('Tên tài khoản hoặc mật khẩu không đúng.'), { code: 'auth/invalid-credential' }); }
function nameOf(value: string) { return accountName(accountEmail(value, true)); }
function userOf(uid: string, account: AccountRecord): DatabaseUser {
  return { uid, username: account.username, email: accountEmail(account.username), access: account.access,
    requiresPasswordChange: account.requiresPasswordChange === true, isDefaultAdmin: account.isDefaultAdmin === true,
    adminRole: account.isDefaultAdmin ? 'super_admin' : account.adminRole || 'viewer', branchId: account.isDefaultAdmin ? '' : account.branchId || '' };
}
export async function passwordRecord(password: string): Promise<PasswordRecord> {
  const salt = bytesToHex(await getRandomBytesAsync(16));
  const iterations = 100000;
  const hash = bytesToHex(await pbkdf2Async(sha256, password, hexToBytes(salt), { c: iterations, dkLen: 32 }));
  return { algorithm: 'pbkdf2-sha256', salt, hash, iterations, version: randomUUID() };
}
export async function matchesPassword(password: string, credential?: PasswordRecord) {
  if (!credential || credential.algorithm !== 'pbkdf2-sha256' || !/^[a-f0-9]{32}$/.test(credential.salt) || !/^[a-f0-9]{64}$/.test(credential.hash) || !Number.isInteger(credential.iterations) || credential.iterations < 10000 || credential.iterations > 1000000) return false;
  const result = await pbkdf2Async(sha256, password, hexToBytes(credential.salt), { c: credential.iterations, dkLen: 32 });
  const expected = hexToBytes(credential.hash);
  let difference = 0;
  for (let i = 0; i < result.length; i++) difference |= result[i] ^ expected[i];
  return difference === 0;
}
export async function findAccount(value: string): Promise<{ uid: string; account: AccountRecord } | null> {
  const name = nameOf(value);
  let snapshot;
  try {
    snapshot = await get(query(ref(database, 'accounts'), orderByChild('username'), equalTo(name)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/index not defined|index.*not.*defined|no.index/i.test(message)) throw error;
    // Demo databases may have open Rules without indexes. Keep legacy UIDs
    // usable by filtering the accounts collection locally in that case.
    snapshot = await get(ref(database, 'accounts'));
  }
  const entries = (Object.entries(snapshot.val() || {}) as [string, AccountRecord][])
    .filter(([, account]) => account && account.username === name);
  if (entries.length > 1) throw new Error('Tên tài khoản bị trùng trên Firebase. Hãy kiểm tra dữ liệu accounts.');
  return entries[0] ? { uid: entries[0][0], account: entries[0][1] } : null;
}
async function ensureDefaultAdmin() {
  const found = await findAccount('admin');
  if (found?.account.credential) return;
  const credential = await passwordRecord('123456');
  const uid = found?.uid || 'admin';
  await runTransaction(ref(database, 'accounts/' + uid), (existing: AccountRecord | null) => {
    if (existing?.credential) return;
    return { username: 'admin', createdAt: new Date().toISOString(), card: '', ...existing,
      access: 'admin', adminRole: 'super_admin', branchId: '', isDefaultAdmin: true, requiresPasswordChange: true, credential };
  });
}
async function attach(session: Session, account: AccountRecord) {
  stop?.(); if (expiryTimer) clearTimeout(expiryTimer); const g = ++generation;
  activeSession = session;
  emit(userOf(session.uid, account));
  stop = onValue(ref(database, 'accounts/' + session.uid), snapshot => {
    if (g !== generation) return;
    const value = snapshot.val() as AccountRecord | null;
    if (!value || value.disabled || value.credential?.version !== session.version || Date.now() >= session.expiresAt) { void logoutDatabase(); return; }
    emit(userOf(session.uid, value));
  }, () => { if (g === generation) void logoutDatabase(); });
  expiryTimer = setTimeout(() => { if (g === generation) void logoutDatabase(); }, Math.max(0, session.expiresAt - Date.now()));
}
export async function restoreDatabaseSession() {
  const g = generation;
  const stored = await AsyncStorage.getItem(STORAGE);
  if (!stored || g !== generation) return;
  let session: Session;
  try { session = JSON.parse(stored); } catch { await AsyncStorage.removeItem(STORAGE); return; }
  if (!session || typeof session.uid !== 'string' || /[.#$\[\]/]/.test(session.uid) || !session.version || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) { await AsyncStorage.removeItem(STORAGE); return; }
  const account = (await get(ref(database, 'accounts/' + session.uid))).val() as AccountRecord | null;
  if (g !== generation) return;
  if (!account || account.disabled || account.credential?.version !== session.version) { await AsyncStorage.removeItem(STORAGE); return; }
  await attach(session, account);
}
export async function loginDatabase(username: string, password: string) {
  const name = nameOf(username);
  if (name === 'admin') await ensureDefaultAdmin();
  const found = await findAccount(name);
  if (!found || found.account.disabled || !(await matchesPassword(password, found.account.credential))) invalidLogin();
  const session = { uid: found.uid, version: found.account.credential!.version, expiresAt: Date.now() + 12 * 3600000 };
  await AsyncStorage.setItem(STORAGE, JSON.stringify(session));
  await attach(session, found.account);
  return true;
}
export async function registerDatabase(username: string, password: string) {
  const name = nameOf(username);
  if (name === 'admin') throw new Error('Tên admin dành cho tài khoản quản trị mặc định.');
  if (password.length < 6) throw new Error('Mật khẩu cần ít nhất 6 ký tự bất kỳ.');
  if (await findAccount(name)) throw new Error('Tên tài khoản đã được sử dụng.');
  const credential = await passwordRecord(password);
  const result = await runTransaction(ref(database, 'accounts/' + name), existing => existing ? undefined : {
    username: name, createdAt: new Date().toISOString(), access: 'user', card: '', credential,
  });
  if (!result.committed) throw new Error('Tên tài khoản đã được sử dụng.');
}
export async function changeDatabasePassword(currentPassword: string | null, password: string) {
  const session = activeSession;
  if (!currentUser || !session) throw new Error('Hãy đăng nhập lại.');
  if (password.length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự bất kỳ.');
  const account = (await get(ref(database, 'accounts/' + session.uid))).val() as AccountRecord | null;
  if (!account || account.credential?.version !== session.version) throw new Error('Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại.');
  if (currentPassword === null ? !account.requiresPasswordChange : !(await matchesPassword(currentPassword, account.credential))) invalidLogin();
  if (await matchesPassword(password, account.credential)) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
  const credential = await passwordRecord(password);
  const result = await runTransaction(ref(database, 'accounts/' + session.uid), (existing: AccountRecord | null) => {
    if (!existing) return null;
    if (existing.credential?.version !== session.version) return;
    return { ...existing, credential, requiresPasswordChange: false };
  });
  if (!result.committed) throw new Error('Không lưu được mật khẩu. Hãy đăng nhập lại.');
  await logoutDatabase();
}
export async function logoutDatabase() {
  if (expiryTimer) clearTimeout(expiryTimer); expiryTimer = null;
  generation++; stop?.(); stop = null; activeSession = null; emit(null);
  await AsyncStorage.removeItem(STORAGE);
}
