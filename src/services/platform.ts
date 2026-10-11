import { directCall } from './firebase/direct-admin';
import type { Card } from './firebase/firebase-types';
import type { CardTransaction } from './firebase/transaction-service';
import type { Access, Branch } from './admin/model';
export { errorText } from './service-error';
export interface Game {
  id: string; name: string; description: string; branchId: string; deviceId: string;
  price: number; durationSeconds: number; enabled: boolean; version: string;
  available?: boolean; status?: string; lastSeenEpoch?: number;
}
export interface Notice {
  id: string; title: string; message: string; type: string; createdAt: number; read: boolean;
  ticketId?: string; cardUid?: string; deviceId?: string;
}
export interface Ticket {
  id: string; userId: string; email: string; category: string; title: string; message: string;
  cardUid: string; gameId: string; deviceId: string; branchId: string;
  reply: string; status: 'new' | 'working' | 'resolved'; createdAt: number; updatedAt: number;
}
export interface Profile { name: string; phone: string; email: string; memberSince: string }
export interface UserSnapshot {
  profile: Profile; cards: (Card & { id: string; branchId?: string })[];
  card: (Card & { id: string; branchId?: string }) | null; transactions: CardTransaction[];
  games: Game[]; branches: Branch[]; notifications: Notice[]; tickets: Ticket[]; updatedAt: number;
}
export interface PlatformAdmin {
  access: Access; games: Game[]; branches: Branch[];
  devices: { id: string; name?: string; configVersion?: string; price?: number; gameDurationSeconds?: number }[];
  cards: { id: string; name?: string; branchId: string; ownerAuthUid: string; active?: boolean; balance?: number }[];
  tickets: Ticket[];
}
export async function platformCall<T>(name: string, data: unknown = {}): Promise<T> {
  return directCall<T>(name, data);
}
export const readUser = (cardUid?: string | null) => platformCall<UserSnapshot>('userSnapshot', { cardUid: cardUid || '' });
export const ticketStatus = { new: 'Mới', working: 'Đang xử lý', resolved: 'Đã giải quyết' };
