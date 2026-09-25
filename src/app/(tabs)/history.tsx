import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenShell } from '@/components/screen-shell';
import { TransactionItem } from '@/components/transaction-item';
import { Radius, Spacing } from '@/constants/theme';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/hooks/use-theme';

const filters = ['Tất cả', 'Nạp tiền', 'Chơi game', 'Hoàn tiền'];

export default function HistoryScreen() {
  const theme = useTheme();
  const { transactions, historyMessage } = useWallet();
  const [activeFilter, setActiveFilter] = useState('Tất cả');

  const visibleTransactions = useMemo(() => {
    if (activeFilter === 'Nạp tiền') {
      return transactions.filter((transaction) => transaction.type === 'topup' || transaction.type === 'bonus');
    }
    if (activeFilter === 'Chơi game') {
      return transactions.filter((transaction) => transaction.type === 'play');
    }
    if (activeFilter === 'Hoàn tiền') {
      return transactions.filter((transaction) => transaction.type === 'refund');
    }
    return transactions;
  }, [activeFilter, transactions]);

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Lịch sử giao dịch" subtitle="Theo dõi mọi lần nạp tiền, chơi game và hoàn tiền trên thẻ RFID." />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((filter) => {
            const active = activeFilter === filter;
            return (
              <AnimatedPressable
                key={filter}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? theme.tint : theme.surface, borderColor: active ? theme.tint : theme.border },
                ]}
                onPress={() => setActiveFilter(filter)}>
                <Text style={[styles.filterText, { color: active ? '#FFFFFF' : theme.text }]}>{filter}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        <View style={styles.list}>
          {!historyMessage && visibleTransactions.length ? (
            visibleTransactions.map((transaction) => <TransactionItem key={transaction.id} item={transaction} />)
          ) : (
            <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{historyMessage || 'Chưa có giao dịch phù hợp.'}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: 112 },
  filters: { gap: Spacing.sm, paddingBottom: Spacing.lg },
  filterChip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  filterText: { fontSize: 13, fontWeight: '700' },
  list: { gap: Spacing.sm },
  empty: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});
