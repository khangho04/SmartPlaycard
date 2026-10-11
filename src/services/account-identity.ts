const SUFFIX = '@accounts.smartplaycard.invalid';

export function accountEmail(value: string, registration = false): string {
  const name = value.trim().toLowerCase();
  // Keep existing email accounts usable during migration.
  if (!registration && name.includes('@') && !name.endsWith(SUFFIX)) return name;
  const username = name.endsWith(SUFFIX) && !registration ? name.slice(0, -SUFFIX.length) : name;
  if (!/^[a-z0-9][a-z0-9_]{2,31}$/.test(username)) {
    throw new Error('Tên tài khoản gồm 3–32 ký tự: chữ không dấu, số hoặc dấu _. Bắt đầu bằng chữ hoặc số.');
  }
  return `${username}${SUFFIX}`;
}

export function accountName(email?: string | null): string {
  return email?.endsWith(SUFFIX) ? email.slice(0, -SUFFIX.length) : email || '';
}
