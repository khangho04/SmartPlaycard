/**
 * Firebase record shapes, separate from the mock UI models.
 * Fields are optional because records may be incomplete. A missing record
 * should be represented by null by the service, not by an empty object.
 * These interfaces describe data; they do not validate Firebase snapshots.
 * Database keys (card UID, transaction pushId, deviceId) live outside records.
 */

/**
 * Firmware samples use text dates and numeric Unix seconds. Preserve raw values;
 * TIME_NOT_SYNCED and zero are not valid heartbeat timestamps.
 */
export type FirebaseTimestamp = string | number;

/** /cards/{UID}: supplied schema plus fields verified from a live card sample. */
export interface Card {
  uid?: string;
  name?: string;
  balance?: number;
  active?: boolean;
  playCount?: number;
  topupCount?: number;
  totalSpent?: number;
  totalTopup?: number;
  lastPlayedAt?: FirebaseTimestamp;
  lastTopupAt?: FirebaseTimestamp;
  lastPlayedAtEpoch?: number;
  lastTopupAtEpoch?: number;
  updatedAt?: string;
  updatedAtEpoch?: number;
}

/** /transactions/{pushId}: verified live sample uses timestamp (seconds) and time (text). */
export interface Transaction {
  uid?: string;
  /** Known firmware values are PLAY and TOPUP; other values are not yet verified. */
  type?: string;
  /** Preserve the recorded amount; its sign convention is not yet verified. */
  amount?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  deviceId?: string;
  timestamp?: FirebaseTimestamp;
  time?: string;
  cardName?: string;
}

/** /devices/{deviceId}: field names and types observed in the GAME001 log. */
export interface Device {
  balanceProtocolVersion?: number;
  name?: string;
  price?: number;
  gameDurationSeconds?: number;
  /** Observed: online. Other firmware states have not yet been verified. */
  status?: string;
  /** Observed: game. Other firmware modes have not yet been verified. */
  mode?: string;
  ipAddress?: string;
  wifiRSSI?: number;
  bootAt?: string;
  /** May contain TIME_NOT_SYNCED; do not assume a parseable date. */
  lastSeen?: string;
  /** Observed 0 when time is not synced; not evidence of a fresh heartbeat. */
  lastSeenEpoch?: number;
  statusUpdatedAt?: string;
  /** Unix seconds in the observed GAME001 record. */
  statusUpdatedAtEpoch?: number;
}
