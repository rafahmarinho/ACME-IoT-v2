import { useQueryClient } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { AppShell } from '@/components/navigation/AppShell';
import { Logo } from '@/components/navigation/Logo';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/feedback';
import { Button } from '@/components/ui/primitives';
import { useOnline, useSimulation } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { OrgProvider, useOrg } from '@/providers/OrgProvider';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import { simulationApi } from '@/services/device-api';
import { colors } from '@/theme';

/** While "live simulation" is on, the foreground client advances the simulation on an interval. */
function SimulationDriver() {
  const { org, can } = useOrg();
  const sim = useSimulation();
  const online = useOnline();
  const qc = useQueryClient();
  const enabled = !!org && !!sim.data?.auto_run && can('simulation.run') && online;

  useEffect(() => {
    if (!enabled || !org) return;
    let active = AppState.currentState === 'active' || Platform.OS === 'web';
    const sub = AppState.addEventListener('change', (s) => (active = s === 'active' || Platform.OS === 'web'));
    const id = setInterval(() => {
      if (!active) return; // paused in background
      simulationApi
        .tick(org.id, 1, true)
        .then((r) => {
          if (!r.skipped) qc.invalidateQueries({ queryKey: ['devices', org.id] });
        })
        .catch(() => undefined);
    }, 8000);
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [enabled, org?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Gate() {
  const { org, loading, error, memberships, refetch } = useOrg();
  const { signOut } = useAuth();

  if (loading && !memberships.length) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <Logo />
        <LoadingState label="Loading your workspace…" />
      </View>
    );
  }
  if (error && !memberships.length) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg }}>
        <ErrorState error={error} onRetry={refetch} title="We couldn't load your organizations" />
      </View>
    );
  }
  if (!org) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg }}>
        <EmptyState
          icon="domain-disabled"
          title="You're not part of an organization yet"
          message="Ask an owner or administrator to invite your email address. You'll get access as soon as they do."
          action={<Button title="Sign out" variant="secondary" onPress={signOut} />}
        />
      </View>
    );
  }
  return (
    <RealtimeProvider>
      <SimulationDriver />
      <AppShell>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: Platform.OS === 'web' ? 'none' : 'default' }} />
      </AppShell>
    </RealtimeProvider>
  );
}

export default function AppLayout() {
  const { session, loading, recovering } = useAuth();
  if (loading) return null;
  if (recovering) return <Redirect href="/reset-password" />;
  if (!session) return <Redirect href="/sign-in" />;
  return (
    <OrgProvider>
      <Gate />
    </OrgProvider>
  );
}
