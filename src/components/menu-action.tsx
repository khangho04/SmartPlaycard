import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './animated-pressable';
import { useTheme } from '@/hooks/use-theme';
import { Brand } from '@/constants/theme';

type Props = {
  title: string; icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void; disabled?: boolean; destructive?: boolean; subtitle?: string;
};
export function MenuAction({ title, icon, onPress, disabled, destructive, subtitle }: Props) {
  const theme = useTheme();
  const color = destructive ? Brand.danger : theme.text;
  return <AnimatedPressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
    disabled={disabled} onPress={onPress} scaleTo={0.98}
    style={[styles.row, { borderColor: theme.border, opacity: disabled ? 0.45 : 1 }]}>
    <View style={[styles.icon, { backgroundColor: `${destructive ? Brand.danger : Brand.primary}12` }]}>
      <Ionicons name={icon} size={21} color={destructive ? Brand.danger : Brand.primary} />
    </View>
    <View style={styles.label}><Text style={{ color, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      {subtitle ? <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>{subtitle}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
  </AnimatedPressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
});
