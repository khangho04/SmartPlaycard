import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { formatBalance, type HistoryItem } from '@/services/wallet-mapping';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const iconMap: Record<HistoryItem['type'], { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  unknown: { icon: 'help-circle', color: Brand.warning },
  topup: { icon: 'add-circle', color: Brand.accent },
  play: { icon: 'game-controller', color: Brand.primary },
  refund: { icon: 'refresh-circle', color: Brand.warning },
  bonus: { icon: 'gift', color: Brand.secondary },
};

export function TransactionItem({ item }: { item: HistoryItem }) {
  const theme = useTheme();
  const meta = iconMap[item.type];
  const isPositive = item.amount !== null && item.amount > 0;

  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}18` }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{item.subtitle}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: isPositive ? Brand.accent : theme.text }]}>
          {isPositive ? '+' : item.amount !== null && item.amount < 0 ? '-' : ''}
          {formatBalance(item.amount === null ? null : Math.abs(item.amount))}
        </Text>
        <Text style={[styles.time, { color: theme.textSecondary }]}>{item.time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  right: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    marginTop: 4,
  },
});
