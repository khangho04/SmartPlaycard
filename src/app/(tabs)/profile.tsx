import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenShell } from '@/components/screen-shell';
import { userProfile } from '@/constants/mock-data';
import { formatBalance } from '@/services/wallet-mapping';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/hooks/use-theme';

const menuItems = [
  { icon: 'person-outline' as const, label: 'Thông tin cá nhân' },
  { icon: 'shield-checkmark-outline' as const, label: 'Bảo mật & mật khẩu' },
  { icon: 'notifications-outline' as const, label: 'Thông báo' },
  { icon: 'help-circle-outline' as const, label: 'Trung tâm hỗ trợ' },
  { icon: 'document-text-outline' as const, label: 'Điều khoản sử dụng' },
];

export default function ProfileScreen() {
  const theme = useTheme();
  const { logout } = useAuth();
  const { wallet, clearSelectedCard } = useWallet();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleReset = () => {
    Alert.alert('Bỏ chọn thẻ', 'Bỏ UID đã lưu trên điện thoại. Dữ liệu thẻ trên Firebase được giữ nguyên.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Bỏ chọn',
        style: 'destructive',
        onPress: () => {
          void clearSelectedCard().catch((error: unknown) => Alert.alert('Lỗi', error instanceof Error ? error.message : String(error)));
        },
      },
    ]);
  };

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Cá nhân" subtitle="Quản lý tài khoản hội viên SmartPlaycard." />

        <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>MA</Text></View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.text }]}>{userProfile.name}</Text>
            <Text style={[styles.profilePhone, { color: theme.textSecondary }]}>{userProfile.phone}</Text>
            <View style={styles.tierBadge}>
              <Ionicons name="star" size={12} color="#FFF" />
              <Text style={styles.tierText}>{userProfile.tier}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Số dư</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{formatBalance(wallet.balance)}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Hội viên từ</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{userProfile.memberSince}</Text>
          </View>
        </View>

        <View style={styles.menu}>
          {menuItems.map((item) => (
            <AnimatedPressable
              key={item.label}
              style={[styles.menuRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => Alert.alert(item.label, 'Tính năng này đang được chuẩn bị cho phiên bản tiếp theo.')}>
              <Ionicons name={item.icon} size={20} color={theme.text} />
              <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </AnimatedPressable>
          ))}
        </View>

        <AnimatedPressable style={[styles.resetButton, { borderColor: theme.border }]} onPress={handleReset}>
          <Ionicons name="refresh-outline" size={18} color={Brand.primary} />
          <Text style={[styles.resetText, { color: Brand.primary }]}>Bỏ chọn thẻ trên thiết bị này</Text>
        </AnimatedPressable>

        <AnimatedPressable style={styles.logoutButton} onPress={() => void handleLogout()}>
          <Ionicons name="log-out-outline" size={18} color={Brand.danger} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </AnimatedPressable>

        <Text style={[styles.version, { color: theme.textSecondary }]}>SmartPlaycard Demo v1.0.0</Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: 112, gap: Spacing.lg },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Brand.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontWeight: '700' },
  profilePhone: { fontSize: 14 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: Brand.warning, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, marginTop: 4 },
  tierText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', gap: Spacing.md },
  statBox: { flex: 1, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  menu: { gap: Spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  resetButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingVertical: Spacing.md },
  resetText: { fontSize: 15, fontWeight: '700' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  logoutText: { color: Brand.danger, fontSize: 15, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: 12 },
});
