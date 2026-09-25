import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenShell } from '@/components/screen-shell';
import { SmartCard } from '@/components/smart-card';
import { cardStatus, formatBalance, formatFirebaseTime } from '@/services/wallet-mapping';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/hooks/use-theme';
import { readErrorMessage } from '@/services/rfid-service';

export default function CardScreen() {
  const theme = useTheme();
  const { wallet, uid, card, selectCard } = useWallet();
  const [inputUid, setInputUid] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectionMessage, setSelectionMessage] = useState('');

  const handleSelect = async () => {
    if (selecting) return;
    setSelecting(true);
    setSelectionMessage('');
    try {
      await selectCard(inputUid);
      setSelectionMessage('Đã chọn thẻ để theo dõi.');
    } catch (error) {
      setSelectionMessage(readErrorMessage(error instanceof Error ? error : new Error(String(error))));
    } finally {
      setSelecting(false);
    }
  };
  const cardDetails = [
    { icon: 'finger-print' as const, label: 'Mã thẻ RFID', value: uid ?? 'Chưa chọn thẻ' },
    { icon: 'checkmark-circle' as const, label: 'Trạng thái', value: cardStatus(card) },
    { icon: 'calendar' as const, label: 'Chơi gần nhất', value: formatFirebaseTime(card?.lastPlayedAt, card?.lastPlayedAtEpoch) },
    { icon: 'wallet' as const, label: 'Số dư', value: formatBalance(wallet.balance) },
  ];

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Thẻ RFID của tôi" subtitle="Kiểm tra số dư và trạng thái liên kết của thẻ thông minh." />
        <SmartCard onScanPress={() => router.push('/scan')} />

        <View style={styles.detailList}>
          {cardDetails.map((item) => (
            <View key={item.label} style={[styles.detailRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.detailIcon, { backgroundColor: `${Brand.primary}12` }]}>
                <Ionicons name={item.icon} size={18} color={Brand.primary} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{item.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={{ color: theme.textSecondary }}>Nhập UID đúng như trên Firebase để theo dõi thẻ trên điện thoại này.</Text>
        <TextInput
          value={inputUid}
          onChangeText={setInputUid}
          placeholder="UID thẻ RFID"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!selecting}
          accessibilityLabel="UID thẻ RFID"
          style={[styles.secondaryButton, { borderColor: theme.border, color: theme.text, paddingHorizontal: Spacing.md }]}
        />
        {selectionMessage ? <Text style={{ color: theme.textSecondary }}>{selectionMessage}</Text> : null}
        <AnimatedPressable
          style={[styles.secondaryButton, { borderColor: theme.border }]}
          disabled={selecting || !inputUid.trim()}
          onPress={() => void handleSelect()}>
          <Ionicons name="link" size={18} color={Brand.primary} />
          <Text style={[styles.secondaryButtonText, { color: Brand.primary }]}>{selecting ? 'Đang kiểm tra...' : 'Theo dõi thẻ này'}</Text>
        </AnimatedPressable>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: 112, gap: Spacing.lg },
  detailList: { gap: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  detailIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 12 },
  detailValue: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingVertical: Spacing.md },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
});
