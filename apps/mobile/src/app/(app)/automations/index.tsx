import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { EmptyState, ErrorState, PageHeader, Screen, SkeletonCards, useIsWide } from '@/components/ui/feedback';
import { Chips, SearchBar } from '@/components/ui/forms';
import { Badge, Button, Card, Divider, Icon, SectionTitle } from '@/components/ui/primitives';
import { useAutomationRuns, useAutomations, useDevices, useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { describeAction, describeTrigger } from '@/lib/automation';
import { timeAgo } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { automationService } from '@/services/db';
import { colors, font, type } from '@/theme';
import type { Automation } from '@/types/db';

const RUN_TONE = { executed: 'success', skipped_cooldown: 'warning', failed: 'danger' } as const;
const RUN_LABEL = { executed: 'Executed', skipped_cooldown: 'Skipped · cooldown', failed: 'Failed' } as const;

export default function Automations() {
  const { org, can } = useOrg();
  const wide = useIsWide();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const automations = useAutomations();
  const runs = useAutomationRuns();
  const devices = useDevices();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const ds = devices.data ?? [];

  const toggle = useMutation({
    mutationFn: (a: Automation) => automationService.update(a.id, { enabled: !a.enabled }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['automations', org?.id] });
      toast.show({ title: a.enabled ? 'Automation enabled' : 'Automation paused', message: a.name, tone: 'success' });
    },
    onError: (e) => toast.show({ title: 'Could not update automation', message: errorMessage(e), tone: 'danger' }),
  });

  const list = (automations.data ?? []).filter(
    (a) => (filter === 'all' || (filter === 'enabled' ? a.enabled : !a.enabled)) && `${a.name} ${a.description}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Screen onRefresh={() => (automations.refetch(), runs.refetch())} refreshing={automations.isRefetching}>
      <PageHeader
        title="Automations"
        subtitle="Simple rules: when a condition is met, run an action — at most once per cooldown"
        actions={can('automation.edit') ? <Button title="New automation" icon="add" size="sm" onPress={() => router.push('/automations/new')} disabled={!online} /> : null}
      />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search automations" />
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: automations.data?.length },
          { value: 'enabled', label: 'Enabled', count: automations.data?.filter((a) => a.enabled).length },
          { value: 'disabled', label: 'Paused', count: automations.data?.filter((a) => !a.enabled).length },
        ]}
      />
      {automations.error && !automations.data ? <ErrorState error={automations.error} onRetry={() => automations.refetch()} /> : null}
      {automations.isLoading && !automations.data ? <SkeletonCards count={3} /> : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1.6 : undefined, width: wide ? undefined : '100%', gap: 12 }}>
          {automations.data && !list.length ? (
            <EmptyState icon="auto-mode" title="No automations found" message="Create a rule like “When the server room is above 27 °C, turn on the backup cooling.”" />
          ) : null}
          {list.map((a) => {
            const last = (runs.data ?? []).find((r) => r.automation_id === a.id);
            return (
              <Card key={a.id} onPress={() => router.push(`/automations/${a.id}`)} style={[{ gap: 10 }, !a.enabled && { opacity: 0.75 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.enabled ? '#F5ECFE' : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="auto-mode" size={22} color={a.enabled ? '#9333EA' : colors.textSubtle} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.h3}>{a.name}</Text>
                    <Text style={type.small} numberOfLines={1}>
                      {a.description || 'No description'}
                    </Text>
                  </View>
                  <Switch
                    value={a.enabled}
                    onValueChange={() => toggle.mutate(a)}
                    disabled={!can('automation.edit') || !online}
                    trackColor={{ true: colors.primary, false: colors.borderStrong }}
                    thumbColor="#fff"
                    accessibilityLabel={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
                  />
                </View>
                <View style={{ gap: 6, padding: 12, backgroundColor: colors.surfaceAlt, borderRadius: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Badge label="IF" tone="primary" />
                    <Text style={[type.small, { color: colors.text, flex: 1 }]}>{describeTrigger(a, ds)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Badge label="THEN" tone="success" />
                    <Text style={[type.small, { color: colors.text, flex: 1 }]}>{describeAction(a, ds)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Text style={type.small}>⏱ Cooldown {a.cooldown_minutes} min</Text>
                  <Text style={type.small}>Last triggered {timeAgo(a.last_triggered_at)}</Text>
                  {last ? <Badge label={RUN_LABEL[last.status]} tone={RUN_TONE[last.status]} /> : null}
                </View>
              </Card>
            );
          })}
        </View>
        <Card style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
          <SectionTitle title="Run history" subtitle="Across all automations" />
          {(runs.data ?? []).slice(0, 15).map((r, i) => (
            <View key={r.id}>
              {i ? <Divider /> : null}
              <View style={{ paddingVertical: 10, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[type.body, { fontFamily: font.medium, fontSize: 14, flex: 1 }]} numberOfLines={1}>
                    {automations.data?.find((a) => a.id === r.automation_id)?.name ?? 'Automation'}
                  </Text>
                  <Badge label={RUN_LABEL[r.status]} tone={RUN_TONE[r.status]} />
                </View>
                <Text style={type.small}>
                  {r.detail} · {timeAgo(r.created_at)}
                </Text>
              </View>
            </View>
          ))}
          {runs.data && !runs.data.length ? <Text style={type.small}>No runs yet. Advance the simulation to evaluate rules.</Text> : null}
        </Card>
      </View>
    </Screen>
  );
}
