import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenShell } from '@/components/screen-shell';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { formatBalance, formatFirebaseTime } from '@/services/wallet-mapping';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/hooks/use-theme';
import { getRfidService } from '@/services/rfid-service';
import { MAX_MONEY, validTopUpAmount, type MoneyReceipt, type TopUpRequest } from '@/services/firebase/money-operation';

const quickAmounts = [50000, 100000, 500000, 1000000, 2000000, 5000000];

export default function TopUpScreen() {
  const theme = useTheme();
  const { wallet, cardMessage, uid, card, connected } = useWallet();
  const [amountText, setAmountText] = useState('200000');
  const [pending, setPending] = useState<TopUpRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const [receipt, setReceipt] = useState<MoneyReceipt | null>(null);
  const [restoreVersion, setRestoreVersion] = useState(0);
  const requestState = useRef({ busy: false, mounted: true });
  const numericAmount = /^\d+$/.test(amountText) ? Number(amountText) : NaN;
  const selectedAmount = pending?.amount ?? (validTopUpAmount(numericAmount) ? numericAmount : null);
  const targetUid = pending?.uid ?? uid;
  const exceedsBalance = !pending && selectedAmount !== null && wallet.balance !== null && wallet.balance + selectedAmount > MAX_MONEY;
  const disabled = !ready || storageError || submitting || !targetUid || selectedAmount === null || !connected ||
    exceedsBalance || (!pending && (!card || card.active === false || Boolean(cardMessage)));

  useEffect(() => {
    const state = requestState.current;
    state.mounted = true;
    let active = true;
    void getRfidService().getPendingTopUp().then((value) => {
      if (active) { setPending(value); setReady(true); }
    }).catch((error: unknown) => {
      if (active) { setStorageError(true); setMessage(error instanceof Error ? error.message : String(error)); }
    });
    return () => { active = false; state.mounted = false; };
  }, [restoreVersion]);

  const handleTopUp = async () => {
    if (disabled || requestState.current.busy || !targetUid || selectedAmount === null) return;
    requestState.current.busy = true;
    setSubmitting(true);
    setSucceeded(false);
    setReceipt(null);
    setMessage('Đang xác nhận giao dịch. Vui lòng chờ...');
    try {
      const receipt = await getRfidService().topUpCard(targetUid, selectedAmount, pending?.id);
      if (requestState.current.mounted) {
        setPending(null);
        setSucceeded(true);
        setReceipt(receipt);
        setMessage(`Đã nạp ${formatBalance(receipt.amount)} vào thẻ ${receipt.uid}.`);
        setAmountText('');
      }
    } catch (error) {
      if (requestState.current.mounted) setMessage(error instanceof Error ? error.message : String(error));
      try {
        const value = await getRfidService().getPendingTopUp();
        if (requestState.current.mounted) setPending(value);
      } catch {
        if (requestState.current.mounted) setStorageError(true);
      }
    } finally {
      requestState.current.busy = false;
      if (requestState.current.mounted) setSubmitting(false);
    }
  };
  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Nạp tiền"
          subtitle="Chọn số tiền và nhấn OK để nạp vào thẻ trong ứng dụng mô phỏng."
        />
        {storageError ? <AnimatedPressable accessibilityRole="button" onPress={() => { setReady(false); setStorageError(false); setMessage(''); setRestoreVersion((value) => value + 1); }}>
          <Text style={{ color: Brand.primary }}>Thử đọc lại giao dịch đang chờ</Text>
        </AnimatedPressable> : null}
        {receipt ? <View style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: Brand.accent }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Nạp tiền thành công</Text>
          <Text selectable style={{ color: theme.textSecondary }}>Mã giao dịch: {receipt.requestId}</Text>
          <Text style={{ color: theme.text }}>Thẻ nhận: {receipt.uid}</Text>
          <Text style={{ color: theme.textSecondary }}>Thời gian: {formatFirebaseTime(receipt.time, receipt.timestamp)}</Text>
          <Text style={{ color: theme.text }}>Số tiền nạp: {formatBalance(receipt.amount)}</Text>
          <Text style={{ color: theme.text }}>Số dư sau giao dịch: {formatBalance(receipt.balanceAfter)}</Text>
          <AnimatedPressable accessibilityRole="button" onPress={() => router.push('/(tabs)/history')}>
            <Text style={{ color: Brand.primary }}>Xem lịch sử giao dịch</Text>
          </AnimatedPressable>
        </View> : null}
        <View style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>Số dư hiện tại</Text>
          <Text style={[styles.balanceValue, { color: theme.text }]}>{formatBalance(wallet.balance)}</Text>
          <Text style={[styles.balanceHint, { color: Brand.accent }]}>Thẻ: {uid ?? 'Chưa chọn thẻ'}</Text>
          {cardMessage ? <Text style={{ color: theme.textSecondary }}>{cardMessage}</Text> : null}
          {!uid ? <AnimatedPressable accessibilityRole="button" onPress={() => router.push('/(tabs)/card')}>
            <Text style={{ color: Brand.primary }}>Chọn thẻ RFID để nạp tiền</Text>
          </AnimatedPressable> : null}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Chọn mệnh giá</Text>
        <View style={styles.amountGrid}>
          {quickAmounts.map((amount) => {
            const active = selectedAmount === amount;
            return (
              <AnimatedPressable
                key={amount}
                disabled={submitting || Boolean(pending)}
                style={[
                  styles.amountChip,
                  { backgroundColor: active ? Brand.primary : theme.surface, borderColor: active ? Brand.primary : theme.border },
                ]}
                onPress={() => {
                  setAmountText(String(amount));
                }}>
                <Text style={[styles.amountText, { color: active ? '#FFF' : theme.text }]}>{formatBalance(amount)}</Text>
              </AnimatedPressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Hoặc nhập số tiền (VNĐ)</Text>
        <TextInput
          value={pending ? String(pending.amount) : amountText}
          onChangeText={setAmountText}
          editable={!submitting && !pending}
          keyboardType="number-pad"
          placeholder="Nhập từ 0 đến 5000000"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Số tiền nạp bằng đồng Việt Nam"
          style={[styles.amountInput, { color: theme.text, backgroundColor: theme.surface, borderColor: selectedAmount === null && amountText !== '' ? Brand.danger : theme.border }]}
        />
        {selectedAmount === null && amountText !== '' ? (
          <Text style={{ color: Brand.danger }}>Nhập số tiền nguyên từ 0đ đến 5.000.000đ, chỉ gồm chữ số.</Text>
        ) : <Text style={{ color: theme.textSecondary }}>{selectedAmount === null ? 'Chọn mệnh giá hoặc nhập từ 0đ đến 5.000.000đ.' : `Số tiền đã chọn: ${formatBalance(selectedAmount)}`}</Text>}
        {exceedsBalance ? <Text style={{ color: Brand.danger }}>Số dư sau khi nạp vượt giới hạn của thẻ. Hãy chọn số tiền nhỏ hơn.</Text> : null}
        {!pending && selectedAmount !== null && uid ? <View style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.text }}>Thẻ nhận: {uid}</Text>
          <Text style={{ color: theme.text }}>Số tiền nạp: {formatBalance(selectedAmount)}</Text>
          <Text style={{ color: theme.textSecondary }}>Số dư dự kiến: {formatBalance(wallet.balance === null || exceedsBalance ? null : wallet.balance + selectedAmount)}</Text>
        </View> : null}

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Hình thức nạp</Text>
        <View style={styles.methodList}>
          <View style={[styles.methodRow, { backgroundColor: theme.surface, borderColor: Brand.primary }]}>
            <View style={[styles.methodIcon, { backgroundColor: `${Brand.primary}15` }]}>
              <Ionicons name="flask" size={20} color={Brand.primary} />
            </View>
            <Text style={[styles.methodLabel, { color: theme.text }]}>Nạp mô phỏng</Text>
            <Ionicons name="checkmark-circle" size={22} color={Brand.primary} />
          </View>
        </View>

        {pending ? <Text style={{ color: theme.textSecondary }}>
          Lần nạp đang chờ: {formatBalance(pending.amount)} cho thẻ {pending.uid}. Nhấn kiểm tra để xác nhận hoặc thử lại cùng giao dịch.
        </Text> : null}
        {!connected ? <Text style={{ color: Brand.danger }}>Chưa kết nối Firebase. Kết nối lại để tiếp tục nạp tiền.</Text> : null}
        {!ready && !storageError ? <Text style={{ color: theme.textSecondary }}>Đang kiểm tra giao dịch đang chờ...</Text> : null}
        {card?.active === false && !pending ? <Text style={{ color: Brand.danger }}>Thẻ đã bị khóa.</Text> : null}
        <AnimatedPressable style={[styles.primaryButton, disabled && styles.disabledButton]} disabled={disabled} accessibilityState={{ disabled, busy: submitting }} onPress={() => void handleTopUp()}>
          <Text style={styles.primaryButtonText}>
            {submitting ? 'Đang xử lý...' : pending ? 'Kiểm tra / thử lại lần nạp' : selectedAmount === null ? 'Nhập số tiền để nạp' : `OK — Nạp ${formatBalance(selectedAmount)}`}
          </Text>
        </AnimatedPressable>

        {message ? (
          <View style={[styles.successBanner, { backgroundColor: succeeded ? Brand.accent : theme.surface }]}>
            <Text accessibilityLiveRegion="polite" style={[styles.successText, { color: succeeded ? '#FFFFFF' : theme.text }]}>{message}</Text>
          </View>
        ) : null}
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Đây là tính năng mô phỏng, không thu tiền thật. Nhấn OK sẽ cộng số tiền đã chọn vào thẻ trên Firebase và lưu lịch sử giao dịch.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: 112, gap: Spacing.md },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Brand.accent },
  successText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  balanceCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg, gap: 6 },
  balanceLabel: { fontSize: 13 },
  balanceValue: { fontSize: 28, fontWeight: '700' },
  balanceHint: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: Spacing.sm },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  amountChip: { width: '48%', borderWidth: 1, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  amountText: { fontSize: 15, fontWeight: '700' },
  amountInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: 16 },
  methodList: { gap: Spacing.sm },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  methodIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  primaryButton: { backgroundColor: Brand.primary, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: Spacing.sm },
});
