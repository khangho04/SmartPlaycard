export type TransactionType = 'topup' | 'play' | 'refund' | 'bonus';

export type Transaction = {
  id: string;
  type: TransactionType;
  title: string;
  subtitle: string;
  amount: number;
  time: string;
};

export type Wallet = {
  balance: number;
  bonusPoints: number;
  lastTopUp: string;
};

export type GameMachine = {
  id: string;
  name: string;
  zone: string;
  price: number;
  status: 'available' | 'busy';
};

export const userProfile = {
  name: 'Nguyễn Minh Anh',
  phone: '0901 234 567',
  memberSince: '03/2026',
  tier: 'Gold Member',
};

export const cardInfo = {
  uid: 'RFID-8F3A2C91',
  maskedUid: '**** **** 2C91',
  status: 'active' as const,
  linkedAt: '07/09/2026',
};

export const initialWallet: Wallet = {
  balance: 285000,
  bonusPoints: 120,
  lastTopUp: 'Hôm nay, 09:15',
};

export const quickAmounts = [50000, 100000, 200000, 500000];

export const paymentMethods = [
  { id: 'momo', label: 'MoMo', icon: 'wallet' as const },
  { id: 'bank', label: 'Chuyển khoản', icon: 'business' as const },
  { id: 'cash', label: 'Tại quầy', icon: 'storefront' as const },
];

export const initialTransactions: Transaction[] = [
  {
    id: '1',
    type: 'play',
    title: 'Máy đua xe VR #03',
    subtitle: 'Khu A - Sim Racing',
    amount: -35000,
    time: '11:42',
  },
  {
    id: '2',
    type: 'topup',
    title: 'Nạp tiền thành công',
    subtitle: 'MoMo • Mệnh giá 200.000đ',
    amount: 200000,
    time: '09:15',
  },
  {
    id: '3',
    type: 'play',
    title: 'Máy bắn súng #12',
    subtitle: 'Khu B - Arcade',
    amount: -20000,
    time: 'Hôm qua',
  },
  {
    id: '4',
    type: 'bonus',
    title: 'Thưởng điểm hội viên',
    subtitle: 'Tích lũy Gold Member',
    amount: 10000,
    time: 'Hôm qua',
  },
  {
    id: '5',
    type: 'refund',
    title: 'Hoàn tiền thừa',
    subtitle: 'Checkout cuối ngày',
    amount: 15000,
    time: '05/09',
  },
];

export const gameMachines: GameMachine[] = [
  { id: '1', name: 'Sim Racing Pro', zone: 'Khu A', price: 35000, status: 'available' },
  { id: '2', name: 'VR Adventure', zone: 'Khu A', price: 45000, status: 'busy' },
  { id: '3', name: 'Arcade Shooter', zone: 'Khu B', price: 20000, status: 'available' },
  { id: '4', name: 'Dance Stage', zone: 'Khu C', price: 15000, status: 'available' },
];

export function formatCurrency(amount: number) {
  return `${amount.toLocaleString('vi-VN')}đ`;
}
