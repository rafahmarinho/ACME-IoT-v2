import { Redirect, Slot, usePathname } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/navigation/Logo';
import { useIsWide } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/primitives';
import { isConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, font, radius, shadow, type } from '@/theme';

const FEATURES = [
  { icon: 'view-in-ar', text: 'Live 3D view of every room' },
  { icon: 'auto-mode', text: 'Condition → action automations with cooldowns' },
  { icon: 'system-update-alt', text: 'Staged firmware rollouts with rollback' },
  { icon: 'cloud-off', text: 'Offline read access on mobile' },
] as const;

export default function AuthLayout() {
  const { session, loading, recovering } = useAuth();
  const path = usePathname();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();

  if (loading) return null;
  if (recovering && path !== '/reset-password') return <Redirect href="/reset-password" />;
  if (session && !recovering) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {wide ? (
        <LinearGradient colors={['#4F46E5', '#3730A3', '#1E1B4B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 4 }}>
              <Logo compact />
            </View>
            <Text style={{ color: '#fff', fontFamily: font.bold, fontSize: 18 }}>ACME IoT</Text>
          </View>
          <View style={{ gap: 18, maxWidth: 440 }}>
            <Text style={styles.heroTitle}>Every building, every room, every device — in one place.</Text>
            <Text style={styles.heroText}>Monitor climate, occupancy and energy across your portfolio, and act on it in seconds.</Text>
            <View style={{ gap: 12, marginTop: 8 }}>
              {FEATURES.map((f) => (
                <View key={f.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={styles.heroIcon}>
                    <Icon name={f.icon} size={18} color="#fff" />
                  </View>
                  <Text style={{ color: '#E0E7FF', fontFamily: font.medium, fontSize: 15 }}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={{ color: '#A5B4FC', fontFamily: font.regular, fontSize: 12 }}>© 2026 ACME IoT, Inc.</Text>
        </LinearGradient>
      ) : null}
      <ScrollView contentContainerStyle={[styles.formWrap, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {!wide ? (
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <Logo />
            </View>
          ) : null}
          {!isConfigured ? (
            <View style={styles.config}>
              <Text style={[type.small, { color: colors.danger }]}>
                Supabase is not configured. Copy apps/mobile/.env.example to .env.local and restart the dev server.
              </Text>
            </View>
          ) : null}
          <Slot />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, maxWidth: 620, padding: 48, justifyContent: 'space-between' },
  heroTitle: { color: '#fff', fontFamily: font.bold, fontSize: 36, lineHeight: 44, letterSpacing: -0.8 },
  heroText: { color: '#C7D2FE', fontFamily: font.regular, fontSize: 17, lineHeight: 26 },
  heroIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  formWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 28, gap: 16, borderWidth: 1, borderColor: colors.border, ...shadow },
  config: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 12 },
});
