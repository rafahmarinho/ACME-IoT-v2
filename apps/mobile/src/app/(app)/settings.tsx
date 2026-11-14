import { useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ConfirmDialog, KeyValue, PageHeader, Screen } from '@/components/ui/feedback';
import { Segmented, Select, TextField, ToggleRow } from '@/components/ui/forms';
import { Button, Card, SectionTitle } from '@/components/ui/primitives';
import { useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { setTemperatureUnit } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { accountService } from '@/services/db';
import { type } from '@/theme';
import type { UserSettings } from '@/types/db';

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Lisbon', 'Europe/Berlin', 'Asia/Singapore', 'Australia/Sydney'];

export default function Settings() {
  const { user, signOut } = useAuth();
  const { org, settings, can } = useOrg();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const [orgName, setOrgName] = useState(org?.name ?? '');
  const [tz, setTz] = useState(org?.timezone ?? 'UTC');
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  useEffect(() => {
    setOrgName(org?.name ?? '');
    setTz(org?.timezone ?? 'UTC');
  }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => accountService.updateSettings(user!.id, patch),
    onMutate: (patch) => {
      if (patch.temperature_unit) setTemperatureUnit(patch.temperature_unit);
      qc.setQueryData(['settings', user?.id], (s: UserSettings | undefined) => (s ? { ...s, ...patch } : s));
    },
    onSuccess: () => toast.show({ title: 'Preferences saved', tone: 'success' }),
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['settings', user?.id] });
      toast.show({ title: 'Could not save preferences', message: errorMessage(e), tone: 'danger' });
    },
  });
  const saveOrg = useMutation({
    mutationFn: async () => {
      if (orgName.trim().length < 2) throw new Error('Organization name is too short.');
      const { error } = await supabase.from('organizations').update({ name: orgName.trim(), timezone: tz }).eq('id', org!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memberships', user?.id] });
      toast.show({ title: 'Organization updated', tone: 'success' });
    },
    onError: (e) => toast.show({ title: 'Could not update organization', message: errorMessage(e), tone: 'danger' }),
  });

  const s = settings;
  return (
    <Screen maxWidth={820}>
      <PageHeader title="Settings" subtitle="Preferences for your account and organization" />
      <Card style={{ gap: 6 }}>
        <SectionTitle title="Display" />
        <Text style={type.label}>Temperature unit</Text>
        <Segmented value={s?.temperature_unit ?? 'celsius'} onChange={(v) => update.mutate({ temperature_unit: v })} disabled={!online} options={[{ value: 'celsius', label: 'Celsius (°C)' }, { value: 'fahrenheit', label: 'Fahrenheit (°F)' }]} />
        <View style={{ height: 12 }} />
        <Select
          label="Live refresh interval"
          value={String(s?.auto_refresh_seconds ?? 15)}
          onChange={(v) => update.mutate({ auto_refresh_seconds: Number(v) })}
          disabled={!online}
          options={[5, 15, 30, 60].map((n) => ({ value: String(n), label: `Every ${n} seconds`, description: n === 5 ? 'Uses more data' : undefined }))}
        />
        <Text style={type.small}>Realtime updates arrive instantly; polling is a fallback. Both pause while the app is in the background.</Text>
      </Card>
      <Card>
        <SectionTitle title="Notifications" />
        <ToggleRow label="In-app alerts" description="Notifications center and banners for alerts and automations." value={!!s?.push_alerts} onValueChange={(v) => update.mutate({ push_alerts: v })} disabled={!online} />
        <ToggleRow label="Critical only" description="Only notify me about critical alerts like offline devices." value={!!s?.critical_only} onValueChange={(v) => update.mutate({ critical_only: v })} disabled={!online || !s?.push_alerts} />
        <ToggleRow label="Email digest" description="Daily summary email (simulated)." value={!!s?.email_alerts} onValueChange={(v) => update.mutate({ email_alerts: v })} disabled={!online} />
      </Card>
      {can('org.manage') ? (
        <Card style={{ gap: 12 }}>
          <SectionTitle title="Organization" subtitle="Visible to everyone in this organization" />
          <TextField label="Organization name" value={orgName} onChangeText={setOrgName} />
          <Select label="Time zone" value={tz} onChange={setTz} options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
          <Button title="Save organization" onPress={() => saveOrg.mutate()} loading={saveOrg.isPending} disabled={!online} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}
      <Card>
        <SectionTitle title="Data & storage" />
        <Text style={[type.small, { marginBottom: 12 }]}>The last synced data is stored on this device so you can read it offline.</Text>
        <Button title="Clear offline cache" variant="secondary" icon="cleaning-services" onPress={() => { queryClient.clear(); queryClient.invalidateQueries(); toast.show({ title: 'Offline cache cleared', tone: 'success' }); }} style={{ alignSelf: 'flex-start' }} />
      </Card>
      <Card>
        <SectionTitle title="About" />
        <KeyValue label="App version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        <KeyValue label="Backend" value={SUPABASE_URL.replace(/^https?:\/\//, '')} mono />
        <KeyValue label="API" value={(process.env.EXPO_PUBLIC_API_URL ?? '').replace(/^https?:\/\//, '')} mono />
        <KeyValue label="Signed in as" value={user?.email ?? ''} />
        <Button title="Sign out" variant="danger" icon="logout" onPress={() => setConfirmSignOut(true)} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
      </Card>
      <ConfirmDialog visible={confirmSignOut} title="Sign out?" message="Cached data on this device will be cleared." confirmLabel="Sign out" destructive onCancel={() => setConfirmSignOut(false)} onConfirm={() => { setConfirmSignOut(false); signOut(); }} />
    </Screen>
  );
}
