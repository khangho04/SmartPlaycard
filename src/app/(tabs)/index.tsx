import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { GameMachineCard } from '@/components/game-machine-card';
import { QuickAction, StatPill } from '@/components/quick-action';
import { ScreenShell } from '@/components/screen-shell';
import { SmartCard } from '@/components/smart-card';
import { TransactionItem } from '@/components/transaction-item';
import { userProfile } from '@/constants/mock-data';
import { formatBalance, formatFirebaseTime } from '@/services/wallet-mapping';
import { Brand, Spacing } from '@/constants/theme';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const { wallet, transactions, device, deviceMessage, historyMessage } = useWallet();
  const recentTransactions = transactions.slice(0, 3);

  const showComingSoon = (title: string) => {
    Alert.alert(title, 'Tính năng này đang được chuẩn bị cho phiên bản tiếp theo.');
  };

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>Xin chào,</Text>
            <Text style={[styles.name, { color: theme.text }]}>{userProfile.name}</Text>
          </View>
          <AnimatedPressable
            style={[styles.notifBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => showComingSoon('Thông báo')}>
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
            <View style={styles.notifDot} />
          </AnimatedPressable>
        </View>

        <SmartCard onScanPress={() => router.push('/scan')} />

        <View style={styles.statsRow}>
          <StatPill icon="star" label="Điểm thưởng" value="Chưa có dữ liệu" />
          <StatPill icon="time" label="Nạp gần nhất" value={wallet.lastTopUp} />
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Thao tác nhanh</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="add-circle" label="Nạp tiền" color={Brand.accent} onPress={() => router.push('/topup')} />
          <QuickAction icon="scan" label="Quét thẻ" color={Brand.primary} onPress={() => router.push('/scan')} />
          <QuickAction icon="game-controller" label="Trò chơi" color={Brand.secondary} onPress={() => showComingSoon('Trò chơi')} />
          <QuickAction icon="headset" label="Hỗ trợ" color={Brand.warning} onPress={() => showComingSoon('Trung tâm hỗ trợ')} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Trò chơi gần bạn</Text>
          <AnimatedPressable onPress={() => showComingSoon('Danh sách trò chơi')}>
            <Text style={[styles.link, { color: Brand.primary }]}>Xem tất cả</Text>
          </AnimatedPressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gameScroll}>
          {device && !deviceMessage ? (
            <GameMachineCard machine={device} onPress={() => Alert.alert(device.name ?? 'GAME001', [
              `Chế độ: ${device.mode ?? 'Chưa rõ'}`,
              `Thời lượng: ${device.gameDurationSeconds === undefined ? 'Chưa rõ' : `${device.gameDurationSeconds} giây`}`,
              `Trạng thái đã lưu: ${device.status ?? 'Chưa rõ'}`,
              `Heartbeat: ${formatFirebaseTime(device.lastSeen, device.lastSeenEpoch)}`,
            ].join('\n'))} />
          ) : <Text style={{ color: theme.textSecondary }}>{deviceMessage}</Text>}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Giao dịch gần đây</Text>
          <AnimatedPressable onPress={() => router.push('/history')}>
            <Text style={[styles.link, { color: Brand.primary }]}>Chi tiết</Text>
          </AnimatedPressable>
        </View>
        <View style={styles.list}>
          {historyMessage ? <Text style={{ color: theme.textSecondary }}>{historyMessage}</Text>
            : recentTransactions.length ? recentTransactions.map((item) => (
              <TransactionItem key={item.id} item={item} />
            )) : <Text style={{ color: theme.textSecondary }}>Chưa có giao dịch.</Text>}
        </View>

        <View style={[styles.banner, { backgroundColor: `${Brand.primary}12`, borderColor: `${Brand.primary}30` }]}>
          <Ionicons name="shield-checkmark" size={22} color={Brand.primary} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { color: theme.text }]}>Thanh toán không tiền mặt</Text>
            <Text style={[styles.bannerDesc, { color: theme.textSecondary }]}>
              Quẹt thẻ tại ESP32 để chơi game. Giá GAME001: {formatBalance(deviceMessage ? null : device?.price)} / lượt.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: 112, gap: Spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 14 },
  name: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  notifBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.danger },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: 13, fontWeight: '600' },
  gameScroll: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  list: { gap: Spacing.sm },
  banner: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: 16, borderWidth: 1 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700' },
  bannerDesc: { fontSize: 12, marginTop: 4, lineHeight: 18 },
});
