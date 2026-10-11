import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, TextInput, Pressable } from 'react-native';
import { errorText, platformCall, ticketStatus, type Game, type PlatformAdmin, type Ticket } from '@/services/platform';
import { formatBalance } from '@/services/wallet-mapping';
import { accountName } from '@/services/account-identity';

export default function PlatformAdminPanel({ colors }: { colors: { text: string; muted: string; line: string; surface: string } }) {
  const theme = { text: colors.text, textSecondary: colors.muted, border: colors.line, surface: colors.surface };
  const [data, setData] = useState<PlatformAdmin | null>(null);
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [game, setGame] = useState({ id: '', name: '', description: '', deviceId: '', branchId: '', price: '', durationSeconds: '', enabled: true });
  const [cardUid, setCardUid] = useState(''); const [email, setEmail] = useState(''); const [branchId, setBranchId] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null); const [reply, setReply] = useState('');
  const [cashAmount, setCashAmount] = useState(''); const [cashReference, setCashReference] = useState('');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [cashPending, setCashPending] = useState(false);
  const cashIntent = useRef<{ id: string; cardUid: string; branchId: string; amount: number; reference: string } | null>(null);
  const replyIntent = useRef<string | null>(null);
  const alive = useRef(true); const request = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    try { const value = await platformCall<PlatformAdmin>('adminPlatformSnapshot'); if (alive.current && version === request.current) setData(value); }
    catch (e) { if (alive.current && version === request.current) { setData(null); setMessage(errorText(e)); } }
  }, []);
  useEffect(() => {
    const requestCounter = request;
    alive.current = true; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, 10000); };
    void poll(); return () => { alive.current = false; stopped = true; requestCounter.current++; clearTimeout(timer); };
  }, [refresh]);
  async function mutate(name: string, value: unknown) {
    setBusy(true); setMessage('');
    try { await platformCall(name, value); if (!alive.current) return false; setMessage('Đã lưu trên hệ thống.'); await refresh(); return true; }
    catch (e) { if (alive.current) setMessage(errorText(e)); return false; }
    finally { if (alive.current) setBusy(false); }
  }
  const input = (value: string, update: (value: string) => void, placeholder: string, numeric = false, locked = false) => <TextInput value={value} onChangeText={update} placeholder={placeholder} placeholderTextColor={theme.textSecondary} editable={!busy && !locked} autoCapitalize="none" keyboardType={numeric ? 'number-pad' : 'default'} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, color: theme.text, backgroundColor: theme.surface }} />;
  const label = (text: string) => <Text style={{ color: theme.text, lineHeight: 22 }}>{text}</Text>;
  const box = { padding: 16, gap: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 14, backgroundColor: theme.surface };
  function edit(g: Game) { setGame({ ...g, price: String(g.price), durationSeconds: String(g.durationSeconds) }); }
  async function saveGame() { await mutate('adminGameSave', { id: game.id, value: { ...game, price: Number(game.price), durationSeconds: Number(game.durationSeconds) } }); }
  async function sendReply(status: string) {
    if (!ticket || !reply.trim()) return;
    replyIntent.current ||= `reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (await mutate('adminSupportReply', { id: ticket.id, requestId: replyIntent.current, reply, status })) { replyIntent.current = null; setTicket(null); setReply(''); }
  }
  async function cash() {
    if (!cashConfirmed) return;
    cashIntent.current ||= { id: `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`, cardUid, branchId, amount: Number(cashAmount), reference: cashReference };
    setCashPending(true);
    if (await mutate('adminCashTopUp', cashIntent.current)) { cashIntent.current = null; setCashPending(false); setCashConfirmed(false); setCashAmount(''); setCashReference(''); }
  }
  const manage = !!data && ['super_admin', 'operations'].includes(data.access.role);
  const finance = !!data && ['super_admin', 'accountant'].includes(data.access.role);
  return <View style={{ gap: 18 }}>
    {label('Đồng bộ game, thẻ và hỗ trợ khách hàng')}
    {<PlatformButton title={'Làm mới'} onPress={() => void refresh()} disabled={busy || (false)} />}{message ? label(message) : null}
    {!data ? label('Đang chờ dữ liệu thật...') : <>
      <View style={box}>{label(`Hỗ trợ: ${data.tickets.filter((t) => t.status === 'new').length} yêu cầu mới`)}
        {!data.tickets.length ? label('Chưa có yêu cầu trong phạm vi quản lý.') : null}
        {data.tickets.map((t) => <View key={t.id} style={box}>{label(`${t.title} · ${ticketStatus[t.status]}`)}{label(`${accountName(t.email)} · Thẻ ${t.cardUid || '—'} · ${t.branchId || 'Toàn hệ thống'}`)}{label(t.message)}{t.reply ? label(`Phản hồi: ${t.reply}`) : null}{<PlatformButton title={'Phản hồi'} onPress={() => { setTicket(t); setReply(t.reply || ''); replyIntent.current = null; }} disabled={busy || (false)} />}</View>)}
        {ticket ? <View style={box}>{label(`Trả lời: ${ticket.title}`)}{input(reply, setReply, 'Nội dung phản hồi')}{<PlatformButton title={'Đang xử lý — gửi phản hồi'} onPress={() => void sendReply('working')} disabled={busy || (!reply.trim())} />}{<PlatformButton title={'Đã giải quyết — gửi phản hồi'} onPress={() => void sendReply('resolved')} disabled={busy || (!reply.trim())} />}</View> : null}
      </View>
      <View style={box}>{label('Danh sách game')}{!data.games.length ? label('Chưa có game. Thêm game sau khi thiết bị thật đăng ký.') : null}
        {data.games.map((g) => { const d = data.devices.find((v) => v.id === g.deviceId); return <View key={g.id} style={box}>{label(`${g.name} · ${g.enabled ? 'Đang công bố' : 'Đã tắt'} · ${formatBalance(g.price)}`)}{label(`${g.deviceId} · ${g.branchId} · ${d?.configVersion === g.version ? 'Máy đã nhận cấu hình' : 'Chờ máy đồng bộ'}`)}{manage ? <PlatformButton title={'Sửa game'} onPress={() => edit(g)} disabled={busy || (false)} /> : null}</View>; })}
        {manage ? <>{label('Thêm / sửa game (mỗi máy một game)')}{input(game.id, (id) => setGame({ ...game, id }), 'Mã game')}{input(game.name, (name) => setGame({ ...game, name }), 'Tên game')}{input(game.description, (description) => setGame({ ...game, description }), 'Mô tả')}
          {label('Chọn máy thật')}{data.devices.map((d) => <View key={d.id}>{<PlatformButton title={`${game.deviceId === d.id ? '✓ ' : ''}${d.name || d.id} — ${d.id}`} onPress={() => setGame({ ...game, deviceId: d.id })} disabled={busy || (false)} />}</View>)}
          {label('Chọn chi nhánh')}{data.branches.map((b) => <View key={b.id}>{<PlatformButton title={`${game.branchId === b.id ? '✓ ' : ''}${b.name}`} onPress={() => setGame({ ...game, branchId: b.id })} disabled={busy || (false)} />}</View>)}
          {input(game.price, (price) => setGame({ ...game, price }), 'Giá mỗi lượt (VND)', true)}{input(game.durationSeconds, (durationSeconds) => setGame({ ...game, durationSeconds }), 'Thời lượng (giây)', true)}
          {<PlatformButton title={game.enabled ? '✓ Đang bật hiển thị' : 'Đang tắt hiển thị'} onPress={() => setGame({ ...game, enabled: !game.enabled })} disabled={busy || (false)} />}{<PlatformButton title={'Lưu và gửi cấu hình tới máy'} onPress={() => void saveGame()} disabled={busy || (!game.id || !game.name || !game.deviceId || !game.branchId || !game.price || !game.durationSeconds)} />}
        </> : null}
      </View>
      {manage || finance ? <View style={box}>{label('Thẻ / nạp tiền tại quầy')}
        {data.cards.map((c) => <View key={c.id}>{<PlatformButton title={`${c.id} · ${c.branchId || 'Chưa gán'} · ${c.ownerAuthUid ? 'Đã liên kết' : 'Chưa liên kết'} · ${formatBalance(c.balance)}`} onPress={() => { setCardUid(c.id); setBranchId(c.branchId); }} disabled={busy || (cashPending)} />}</View>)}
        {input(cardUid, setCardUid, 'UID thẻ thật', false, cashPending)}{input(branchId, setBranchId, 'Mã chi nhánh', false, cashPending)}
        {manage ? <>{input(email, setEmail, 'Tên tài khoản User')}{<PlatformButton title={'Liên kết thẻ với User và chi nhánh'} onPress={() => void mutate('adminCardAssign', { cardUid, email, branchId })} disabled={busy || (!cardUid || !email || !branchId)} />}</> : null}
        {finance ? <>{input(cashAmount, setCashAmount, 'Tiền đã thu (VND)', true, cashPending)}{input(cashReference, setCashReference, 'Số biên nhận tại quầy', false, cashPending)}{<PlatformButton title={cashConfirmed ? '✓ Xác nhận đã thu tiền' : 'Tôi xác nhận đã thu tiền tại quầy'} onPress={() => setCashConfirmed(!cashConfirmed)} disabled={busy || (cashPending)} />}{<PlatformButton title={cashPending ? 'Kiểm tra / thử lại cùng giao dịch' : 'Ghi nhận tiền đã thu'} onPress={() => void cash()} disabled={busy || (!cashConfirmed || !cardUid || !branchId || !cashAmount || !cashReference)} />}</> : null}
      </View> : null}
    </>}
  </View>;
}

function PlatformButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled: boolean }) {
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ padding: 12, borderRadius: 10, backgroundColor: "#5264E8", opacity: disabled ? 0.5 : 1 }}><Text style={{ color: "#fff" }}>{title}</Text></Pressable>;
}
