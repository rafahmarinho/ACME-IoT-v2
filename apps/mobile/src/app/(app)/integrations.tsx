import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { RequirePermission } from '@/components/navigation/RequirePermission';
import { ConfirmDialog, EmptyState, FormSheet, PageHeader, Screen, SkeletonCards, useIsWide } from '@/components/ui/feedback';
import { Select, TextField } from '@/components/ui/forms';
import { Badge, Button, Card, Divider, Icon, SectionTitle, type IconName } from '@/components/ui/primitives';
import { useIntegrationDeliveries, useIntegrations, useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { integrationService } from '@/services/db';
import { integrationApi } from '@/services/device-api';
import { colors, font, type } from '@/theme';
import type { Integration, Severity } from '@/types/db';

const PROVIDERS: Record<Integration['provider'], { label: string; icon: IconName; color: string; field: string; placeholder: string }> = {
  slack: { label: 'Slack', icon: 'tag', color: '#611F69', field: 'channel', placeholder: '#facilities-alerts' },
  microsoft_teams: { label: 'Microsoft Teams', icon: 'groups', color: '#4B53BC', field: 'channel', placeholder: 'Facilities Operations' },
  webhook: { label: 'Webhook', icon: 'webhook', color: '#0F766E', field: 'url', placeholder: 'https://example.com/hooks/iot' },
  email: { label: 'Email', icon: 'mail', color: '#0284C7', field: 'recipients', placeholder: 'ops@example.com' },
  pagerduty: { label: 'PagerDuty', icon: 'campaign', color: '#06AC38', field: 'service', placeholder: 'Building Operations' },
};

function IntegrationsInner() {
  const { org } = useOrg();
  const wide = useIsWide();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const integrations = useIntegrations();
  const deliveries = useIntegrationDeliveries(true);
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<Integration['provider']>('slack');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [severity, setSeverity] = useState<Severity>('warning');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<Integration | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['integrations', org?.id] });
    qc.invalidateQueries({ queryKey: ['integration-deliveries', org?.id] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const next: Record<string, string> = {};
      if (name.trim().length < 2) next.name = 'Name the integration.';
      if (!target.trim()) next.target = 'This field is required.';
      if (provider === 'webhook' && !/^https:\/\//.test(target.trim())) next.target = 'Webhook URLs must start with https://';
      if (provider === 'email' && !/^\S+@\S+\.\S+/.test(target.trim())) next.target = 'Enter a valid email address.';
      setErrors(next);
      if (Object.keys(next).length) throw new Error('validation');
      return integrationService.create({ org_id: org!.id, provider, name: name.trim(), config: { [PROVIDERS[provider].field]: target.trim() }, forward_severity: severity });
    },
    onSuccess: (i) => {
      invalidate();
      toast.show({ title: 'Integration connected', message: i.name, tone: 'success' });
      setCreating(false);
      setName('');
      setTarget('');
    },
    onError: (e) => errorMessage(e) !== 'validation' && toast.show({ title: 'Could not connect', message: errorMessage(e), tone: 'danger' }),
  });
  const toggle = useMutation({
    mutationFn: (i: Integration) => integrationService.update(i.id, { enabled: !i.enabled }),
    onSuccess: invalidate,
    onError: (e) => toast.show({ title: 'Could not update', message: errorMessage(e), tone: 'danger' }),
  });
  const test = useMutation({
    mutationFn: (i: Integration) => integrationApi.test(org!.id, i.id),
    onSuccess: (r, i) => {
      invalidate();
      toast.show({ title: r.status === 'delivered' ? `Test delivered to ${i.name}` : `Test failed for ${i.name}`, message: `HTTP ${r.status_code} in ${r.latency_ms} ms (simulated)`, tone: r.status === 'delivered' ? 'success' : 'warning' });
    },
    onError: (e) => toast.show({ title: 'Test failed', message: errorMessage(e), tone: 'danger' }),
  });
  const remove = useMutation({
    mutationFn: (i: Integration) => integrationService.remove(i.id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.show({ title: 'Integration removed', tone: 'success' });
    },
    onError: (e) => toast.show({ title: 'Could not remove', message: errorMessage(e), tone: 'danger' }),
  });

  const list = integrations.data ?? [];
  return (
    <Screen onRefresh={() => (integrations.refetch(), deliveries.refetch())} refreshing={integrations.isRefetching}>
      <PageHeader
        title="Integrations"
        subtitle="Forward alerts to external tools. Deliveries are simulated — no real messages are sent."
        actions={<Button title="Connect" icon="add-link" size="sm" onPress={() => setCreating(true)} disabled={!online} />}
      />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1.4 : undefined, width: wide ? undefined : '100%', gap: 12 }}>
          {integrations.isLoading && !integrations.data ? <SkeletonCards count={3} /> : null}
          {integrations.data && !list.length ? <EmptyState icon="hub" title="No integrations yet" message="Connect Slack, Teams, email, PagerDuty or a webhook." /> : null}
          {list.map((i) => {
            const p = PROVIDERS[i.provider];
            const detail = Object.values(i.config ?? {})[0];
            return (
              <Card key={i.id} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${p.color}18`, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={p.icon} size={22} color={p.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.h3} numberOfLines={1}>{i.name}</Text>
                    <Text style={type.small} numberOfLines={1}>{p.label} · {String(detail ?? '')}</Text>
                  </View>
                  <Switch value={i.enabled} onValueChange={() => toggle.mutate(i)} disabled={!online} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#fff" accessibilityLabel={`Enable ${i.name}`} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge label={`Forwards ${i.forward_severity}+`} tone="primary" />
                  {i.last_status ? <Badge label={`Last: ${i.last_status}`} tone={i.last_status === 'delivered' ? 'success' : 'danger'} /> : <Badge label="Never delivered" />}
                  <Text style={type.small}>{i.last_delivery_at ? timeAgo(i.last_delivery_at) : ''}</Text>
                  <View style={{ flex: 1 }} />
                  <Button title="Send test" size="sm" variant="secondary" icon="send" onPress={() => test.mutate(i)} loading={test.isPending && test.variables?.id === i.id} disabled={!online} />
                  <Button title="Remove" size="sm" variant="ghost" onPress={() => setDeleting(i)} disabled={!online} />
                </View>
              </Card>
            );
          })}
        </View>
        <Card style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
          <SectionTitle title="Delivery log" subtitle="Simulated HTTP responses" />
          {(deliveries.data ?? []).slice(0, 20).map((d, idx) => (
            <View key={d.id}>
              {idx ? <Divider /> : null}
              <View style={{ paddingVertical: 10, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[type.body, { fontSize: 14, fontFamily: font.medium, flex: 1 }]} numberOfLines={1}>{d.summary}</Text>
                  <Badge label={`${d.status_code}`} tone={d.status === 'delivered' ? 'success' : 'danger'} />
                </View>
                <Text style={type.small}>{list.find((i) => i.id === d.integration_id)?.name ?? 'Integration'} · {d.latency_ms} ms · {timeAgo(d.created_at)}</Text>
              </View>
            </View>
          ))}
          {deliveries.data && !deliveries.data.length ? <Text style={type.small}>No deliveries yet.</Text> : null}
        </Card>
      </View>
      <FormSheet visible={creating} title="Connect an integration" onClose={() => setCreating(false)}>
        <Select label="Service" value={provider} onChange={(v) => setProvider(v as any)} options={(Object.keys(PROVIDERS) as Integration['provider'][]).map((k) => ({ value: k, label: PROVIDERS[k].label, icon: PROVIDERS[k].icon }))} />
        <TextField label="Name" value={name} onChangeText={setName} placeholder={`${PROVIDERS[provider].label} — Facilities`} error={errors.name} />
        <TextField label={PROVIDERS[provider].field[0].toUpperCase() + PROVIDERS[provider].field.slice(1)} value={target} onChangeText={setTarget} placeholder={PROVIDERS[provider].placeholder} autoCapitalize="none" error={errors.target} />
        <Select label="Forward alerts of severity" value={severity} onChange={(v) => setSeverity(v as Severity)} options={[{ value: 'info', label: 'Info and above' }, { value: 'warning', label: 'Warning and above' }, { value: 'critical', label: 'Critical only' }]} />
        <Button title="Connect" size="lg" onPress={() => create.mutate()} loading={create.isPending} />
      </FormSheet>
      <ConfirmDialog visible={!!deleting} title="Remove integration?" message={`${deleting?.name} will stop receiving alerts.`} confirmLabel="Remove" destructive loading={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)} />
    </Screen>
  );
}

export default function Integrations() {
  return (
    <RequirePermission action="integration.manage">
      <IntegrationsInner />
    </RequirePermission>
  );
}
