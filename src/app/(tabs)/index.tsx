import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/animated-pressable';
import { MenuAction } from '@/components/menu-action';
import { useTheme } from '@/hooks/use-theme';
import { Brand } from '@/constants/theme';
import { Action, UserBox, UserText } from '@/components/user-page';
import { ScreenShell } from '@/components/screen-shell';
import { FormScrollView } from '@/components/keyboard-form';
import { SmartCard } from '@/components/smart-card';
import { TransactionItem } from '@/components/transaction-item';
import { useWallet } from '@/contexts/wallet-context';
import { formatBalance } from '@/services/wallet-mapping';
import { accountName } from '@/services/account-identity';
export default function HomeScreen() {
  const theme = useTheme();
  const { data, transactions, error, refresh, isReady } = useWallet();
  const unread = data?.notifications.filter((n) => !n.read).length || 0;
  return <ScreenShell><FormScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 110 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}><Text style={{ color: theme.textSecondary, fontSize: 13 }}>Xin chào,</Text>
        <Text style={{ color: theme.text, fontSize: 24, fontWeight: '700', marginTop: 4 }}>{data?.profile.name || accountName(data?.profile.email) || 'bạn'}</Text></View>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel={`Thông báo, ${unread} chưa đọc`} onPress={() => router.push('/notifications')}
        style={{ minWidth: 48, minHeight: 48, borderRadius: 16, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="notifications-outline" size={23} color={theme.text} />
        {unread ? <View style={{ position: 'absolute', right: 9, top: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.danger }} /> : null}
      </AnimatedPressable>
    </View>
    {error ? <UserBox><UserText>{error}</UserText><Action title="Thử tải lại" onPress={() => void refresh()} /></UserBox> : null}
    <SmartCard onEnterUidPress={() => router.push('/card')} />
    <UserBox>
      <MenuAction title="Nạp tiền" subtitle="Nạp tiền vào thẻ theo UID" icon="wallet-outline" onPress={() => router.push('/topup')} />
      <MenuAction title="Trò chơi" icon="game-controller-outline" onPress={() => router.push('/games')} />
      <MenuAction title="Hỗ trợ" icon="help-circle-outline" onPress={() => router.push('/support')} />
    </UserBox>
    <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Trò chơi tại các chi nhánh</Text>
    {!isReady ? <UserText>Đang tải...</UserText> : !data?.games.length ? <UserText>Chưa có trò chơi được công bố.</UserText> : null}
    {data?.games.slice(0, 3).map((g) => <UserBox key={g.id}><Text style={{ color: theme.text, fontWeight: '600', fontSize: 16 }}>{g.name}</Text><UserText>{formatBalance(g.price)} / lượt</UserText><Text style={{ color: theme.textSecondary, fontSize: 13 }}>{data.branches.find((b) => b.id === g.branchId)?.name || g.branchId} · {g.available ? g.status === 'playing' ? 'Đang có người chơi' : 'Sẵn sàng' : 'Chưa sẵn sàng'}</Text></UserBox>)}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', flex: 1 }}>Giao dịch gần đây</Text>
      <AnimatedPressable accessibilityRole="button" onPress={() => router.push('/history')} style={{ paddingVertical: 12 }}><Text style={{ color: Brand.primary }}>Xem tất cả</Text></AnimatedPressable>
    </View>
    {transactions.slice(0, 3).map((t) => <TransactionItem key={t.id} item={t} />)}
    {!transactions.length ? <UserText>Chưa có giao dịch của thẻ đang chọn.</UserText> : null}
  </FormScrollView></ScreenShell>;
}
