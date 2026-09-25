export const MIN_TOPUP = 0;
export const MAX_TOPUP = 5000000;
export const MAX_MONEY = 2147483647; // ESP32 firmware uses signed 32-bit integers.

export type TopUpRequest = { id: string; uid: string; amount: number; timestamp: number };
export type MoneyReceipt = {
  requestId: string; uid: string; type: 'TOPUP' | 'PLAY'; amount: number;
  balanceBefore: number; balanceAfter: number; timestamp: number;
  time: string; cardName: string; deviceId: string; source: string; paymentMethod: string;
};

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dữ liệu thẻ không hợp lệ.');
  return value as Record<string, unknown>;
}

export function validTopUpAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount >= MIN_TOPUP && amount <= MAX_TOPUP;
}

function money(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_MONEY) {
    throw new Error(`Dữ liệu ${field} không hợp lệ.`);
  }
  return value;
}

export function findReceipt(value: unknown, request: TopUpRequest): MoneyReceipt | null {
  if (value === null) return null;
  const card = objectValue(value);
  if (card._operations === undefined) return null;
  const records = objectValue(card._operations);
  if (records[request.id] === undefined) return null;
  const receipt = objectValue(records[request.id]);
  if (receipt.requestId !== request.id || receipt.uid !== request.uid || receipt.type !== 'TOPUP' || receipt.amount !== request.amount) {
    throw new Error('Mã nạp tiền đã được dùng cho giao dịch khác.');
  }
  for (const field of ['time', 'cardName', 'deviceId', 'source', 'paymentMethod']) {
    if (typeof receipt[field] !== 'string') throw new Error('Biên nhận nạp tiền không hợp lệ.');
  }
  const before = money(receipt.balanceBefore, 'balanceBefore');
  const after = money(receipt.balanceAfter, 'balanceAfter');
  if (after - before !== request.amount || typeof receipt.timestamp !== 'number' || !Number.isFinite(receipt.timestamp)) {
    throw new Error('Biên nhận nạp tiền không hợp lệ.');
  }
  return receipt as MoneyReceipt;
}

/** Pure transaction callback: no writes, clocks, IDs or side effects inside retries. */
export function applyTopUp(value: unknown, request: TopUpRequest): Record<string, unknown> | null {
  if (!validTopUpAmount(request.amount)) throw new Error('Số tiền phải là số nguyên từ 0đ đến 5.000.000đ.');
  // Firebase can initially invoke a transaction with an empty local cache.
  if (value === null) return null;
  const card = objectValue(value);
  if (findReceipt(card, request)) return card;
  if (card.active === false) throw new Error('Thẻ đã bị khóa.');
  if (card.active !== undefined && typeof card.active !== 'boolean') throw new Error('Trạng thái thẻ không hợp lệ.');
  const before = money(card.balance, 'balance');
  const after = money(before + request.amount, 'balance');
  const count = money(money(card.topupCount ?? 0, 'topupCount') + 1, 'topupCount');
  const total = money(money(card.totalTopup ?? 0, 'totalTopup') + request.amount, 'totalTopup');
  const time = new Date(request.timestamp * 1000).toISOString();
  const receipt: MoneyReceipt = {
    requestId: request.id, uid: request.uid, type: 'TOPUP', amount: request.amount,
    balanceBefore: before, balanceAfter: after, timestamp: request.timestamp, time,
    cardName: typeof card.name === 'string' ? card.name : `Card ${request.uid}`,
    deviceId: 'APP', source: 'APP', paymentMethod: 'simulation',
  };
  return {
    ...card, balance: after, topupCount: count, totalTopup: total,
    lastTopupAt: time, lastTopupAtEpoch: request.timestamp,
    _operations: { ...(card._operations === undefined ? {} : objectValue(card._operations)), [request.id]: receipt },
  };
}
