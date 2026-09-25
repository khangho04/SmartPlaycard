import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ScreenShell } from '@/components/screen-shell';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ScanScreen() {
  const theme = useTheme();
  return (
    <ScreenShell edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.text} />
        </AnimatedPressable>
        <Text style={[styles.title, { color: theme.text }]}>Quét thẻ RFID</Text>
        <View style={styles.closeButton} />
      </View>
      <View style={styles.body}>
        <View style={[styles.scanFrame, { borderColor: Brand.primary }]}>
          <View style={[styles.corner, styles.topLeft, { borderColor: Brand.primary }]} />
          <View style={[styles.corner, styles.topRight, { borderColor: Brand.primary }]} />
          <View style={[styles.corner, styles.bottomLeft, { borderColor: Brand.primary }]} />
          <View style={[styles.corner, styles.bottomRight, { borderColor: Brand.primary }]} />
          <Ionicons name="wifi" size={64} color={Brand.primary} />
        </View>
        <Text style={[styles.status, { color: theme.text }]}>Chưa hỗ trợ quét thẻ trong app</Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          ESP32 đọc thẻ RFID. Hiện app chưa nhận được UID từ lần quét; hãy nhập UID thật tại màn hình Thẻ RFID để theo dõi số dư.
        </Text>
        <AnimatedPressable style={styles.doneButton} onPress={() => router.replace('/card')}>
          <Text style={styles.doneButtonText}>Nhập UID thủ công</Text>
        </AnimatedPressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  scanFrame: { width: 220, height: 220, borderRadius: Radius.lg, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  corner: { position: 'absolute', width: 28, height: 28, borderWidth: 3 },
  topLeft: { top: 12, left: 12, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  topRight: { top: 12, right: 12, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 12, left: 12, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 12, right: 12, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  status: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  retryButton: { borderWidth: 1, borderColor: Brand.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.pill },
  retryText: { color: Brand.primary, fontSize: 16, fontWeight: '700' },
  doneButton: { backgroundColor: Brand.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.pill },
  doneButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
