import { get, ref } from 'firebase/database';
import { database } from './firebase-config';
import { auth } from './auth';
import { getCard } from './card-service';
import { getCardTransactions } from './transaction-service';
import { validateKey } from './record-utils';
import type { Game, Notice, Ticket, UserSnapshot } from '../platform';
import type { Branch } from '../admin/model';

function records<T>(value: unknown): (T & { id: string })[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).filter(([, item]) => item && typeof item === 'object')
    .map(([id, item]) => ({ ...item, id } as T & { id: string }));
}

// Read only the card at the entered UID, without listing cards or checking ownership.
export async function readUserWallet(accountId: string, selectedUid?: string | null): Promise<UserSnapshot> {
  const uid = validateKey(accountId);
  if (auth.currentUser?.uid !== uid) throw new Error('Hãy đăng nhập lại.');
  const selected = selectedUid ? validateKey(selectedUid) : null;
  const [accountSnapshot, rawCard, userDataSnapshot, gamesSnapshot, branchesSnapshot, ticketsSnapshot] = await Promise.all([
    get(ref(database, `accounts/${uid}`)),
    selected ? getCard(selected) : Promise.resolve(null),
    get(ref(database, `userData/${uid}`)),
    get(ref(database, 'catalog/games')),
    get(ref(database, 'admin/operations/branches')),
    get(ref(database, 'support')),
  ]);
  const account = accountSnapshot.val() || {};
  const userData = userDataSnapshot.val() || {};
  const card = rawCard && selected ? { ...rawCard, id: selected } : null;
  const cards = card ? [card] : [];
  if (selected && !card) throw new Error('Không tìm thấy dữ liệu thẻ trên Firebase.');
  const transactions = selected ? (await getCardTransactions(selected)).slice(0, 100) : [];
  return {
    profile: { name: userData.profile?.name || account.username || '', phone: userData.profile?.phone || '', email: auth.currentUser?.email || '', memberSince: account.createdAt || '' },
    cards, card, transactions,
    games: records<Game>(gamesSnapshot.val()).filter((game) => game.enabled).map((game) => ({ ...game, available: false, status: 'unknown' })),
    branches: records<Branch>(branchesSnapshot.val()),
    notifications: records<Notice>(userData.notifications).sort((a, b) => b.createdAt - a.createdAt),
    tickets: records<Ticket>(ticketsSnapshot.val()).filter((ticket) => ticket.userId === uid).sort((a, b) => b.updatedAt - a.updatedAt), updatedAt: Date.now(),
  };
}
