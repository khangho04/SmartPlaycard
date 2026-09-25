import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { formatBalance } from '@/services/wallet-mapping';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useWallet } from '@/contexts/wallet-context';

type SmartCardProps = {
  onScanPress?: () => void;
};

export function SmartCard({ onScanPress }: SmartCardProps) {
  const { wallet, uid, cardMessage } = useWallet();

  return (
    <LinearGradient
      colors={[Brand.cardGradientStart, Brand.cardGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.brand}>SmartPlaycard</Text>
          <Text style={styles.subtitle}>Thẻ RFID thông minh</Text>
        </View>
        <View style={styles.chip}>
          <Ionicons name="wifi" size={18} color="#FFFFFF" />
        </View>
      </View>

      <Text style={styles.uid}>{uid ? `**** ${uid.slice(-4)}` : 'Chưa chọn thẻ'}</Text>
      <Text style={styles.uidLabel}>UID: {uid ?? '—'}</Text>
      {cardMessage ? <Text style={styles.uidLabel}>{cardMessage}</Text> : null}

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.balanceLabel}>Số dư khả dụng</Text>
          <Text style={styles.balance}>{formatBalance(wallet.balance)}</Text>
        </View>
        <AnimatedPressable style={styles.scanButton} onPress={onScanPress}>
          <Ionicons name="scan" size={18} color={Brand.primaryDark} />
          <Text style={styles.scanText}>Quét thẻ</Text>
        </AnimatedPressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    minHeight: 200,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
    fontSize: 13,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uid: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: Spacing.lg,
  },
  uidLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: Spacing.lg,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  balance: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  scanText: {
    color: Brand.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
});
