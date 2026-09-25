import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import type { Device } from '@/services/firebase/firebase-types';
import { formatBalance } from '@/services/wallet-mapping';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function GameMachineCard({ machine, onPress }: { machine: Device; onPress?: () => void }) {
  const theme = useTheme();

  return (
    <AnimatedPressable style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={[styles.zoneBadge, { backgroundColor: `${Brand.primary}15` }]}>
          <Text style={[styles.zoneText, { color: Brand.primary }]}>GAME001</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: Brand.warning }]} />
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>
          {machine.status ?? 'Chưa rõ'}
        </Text>
      </View>
      <Text style={[styles.name, { color: theme.text }]}>{machine.name ?? 'GAME001'}</Text>
      <Text style={[styles.statusText, { color: theme.textSecondary }]}>Trạng thái lưu trên Firebase</Text>
      <View style={styles.bottomRow}>
        <Ionicons name="pricetag" size={14} color={theme.textSecondary} />
        <Text style={[styles.price, { color: theme.textSecondary }]}>
          {formatBalance(machine.price)} / lượt
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 170,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginRight: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  zoneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  zoneText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  statusText: {
    fontSize: 11,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  price: {
    fontSize: 12,
  },
});
