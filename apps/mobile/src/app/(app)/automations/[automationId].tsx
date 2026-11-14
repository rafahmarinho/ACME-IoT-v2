import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner, ConfirmDialog, EmptyState, PageHeader, Screen, SkeletonCards, useIsWide } from '@/components/ui/feedback';
import { Segmented, Select, TextField, ToggleRow } from '@/components/ui/forms';
import { Badge, Button, Card, Divider, SectionTitle } from '@/components/ui/primitives';
import { useAutomationRuns, useAutomations, useDevices, useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { METRICS_BY_TYPE, OPERATOR_LABEL } from '@/lib/automation';
import { DEVICE_LABEL, formatDateTime, METRIC_LABEL, timeAgo } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { automationService, type AutomationInput } from '@/services/db';
import { colors, type } from '@/theme';
import type { Automation } from '@/types/db';

const RUN_TONE = { executed: 'success', skipped_cooldown: 'warning', failed: 'danger' } as const;
const RUN_LABEL = { executed: 'Executed', skipped_cooldown: 'Skipped · cooldown', failed: 'Failed' } as const;

export default function AutomationEditor() {
  const { automationId } = useLocalSearchParams<{ automationId: string }>();
  const isNew = automationId === 'new';
  const { org, can } = useOrg();
  const { user } = useAuth();
  const wide = useIsWide();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const automations = useAutomations();
  const devices = useDevices();
  const runs = useAutomationRuns(isNew ? undefined : automationId);
  const existing = automations.data?.find((a) => a.id === automationId);
  const editable = can('automation.edit') && online;

  const [form, setForm] = useState<AutomationInput | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (form || !org) return;
    if (existing) {
      const { id, created_at, last_triggered_at, ...rest } = existing as Automation & { created_by?: string };
      delete (rest as any).created_by;
      setForm(rest);
    } else if (isNew && devices.data) {
      const first = devices.data.find((d) => d.type === 'temperature_sensor') ?? devices.data[0];
      setForm({
        org_id: org.id,
        name: '',
        description: '',
        enabled: true,
        trigger_device_id: first?.id ?? '',
        trigger_metric: first ? METRICS_BY_TYPE[first.type][0] : 'temperature',
        trigger_operator: 'gt',
        trigger_value: 26,
        action_kind: 'notify',
        action_device_id: null,
        action_payload: {},
        notify: true,
        cooldown_minutes: 15,
      });
    }
  }, [existing, isNew, devices.data, org, form]);

  const ds = devices.data ?? [];
  const trigger = ds.find((d) => d.id === form?.trigger_device_id);
  const metricOptions = trigger ? METRICS_BY_TYPE[trigger.type] : [];
  const actionTargets = useMemo(
    () => ds.filter((d) => (form?.action_kind === 'set_temperature' ? d.type === 'thermostat' : form?.action_kind === 'set_power' ? d.type === 'smart_plug' : false)),
    [ds, form?.action_kind],
  );
  const set = (patch: Partial<AutomationInput>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('validation');
      const next: Record<string, string> = {};
      if (form.name.trim().length < 3) next.name = 'Give the automation a descriptive name.';
      if (!form.trigger_device_id) next.trigger = 'Choose a device to watch.';
      if (!Number.isFinite(Number(form.trigger_value))) next.value = 'Enter a number.';
      if (form.action_kind !== 'notify' && !form.action_device_id) next.target = 'Choose the device to control.';
      if (form.action_kind === 'set_temperature') {
        const sp = Number(form.action_payload?.setpoint);
        if (!(sp >= 10 && sp <= 32)) next.setpoint = 'Setpoint must be between 10 and 32 °C.';
      }
      if (!(form.cooldown_minutes >= 0 && form.cooldown_minutes <= 1440)) next.cooldown = '0–1440 minutes.';
      setErrors(next);
      if (Object.keys(next).length) throw new Error('validation');
      const input = { ...form, name: form.name.trim(), trigger_value: Number(form.trigger_value), action_device_id: form.action_kind === 'notify' ? null : form.action_device_id };
      return isNew ? automationService.create(input, user?.id ?? '') : automationService.update(automationId, input);
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['automations', org?.id] });
      toast.show({ title: isNew ? 'Automation created' : 'Automation saved', message: a.name, tone: 'success' });
      router.replace('/automations');
    },
    onError: (e) => {
      if (errorMessage(e) !== 'validation') toast.show({ title: 'Could not save automation', message: errorMessage(e), tone: 'danger' });
    },
  });

  const remove = useMutation({
    mutationFn: () => automationService.remove(automationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations', org?.id] });
      toast.show({ title: 'Automation deleted', tone: 'success' });
      router.replace('/automations');
    },
    onError: (e) => toast.show({ title: 'Could not delete', message: errorMessage(e), tone: 'danger' }),
  });

  if ((automations.isLoading && !automations.data) || (!form && (isNew || existing))) return <Screen><SkeletonCards count={3} /></Screen>;
  if (!isNew && !existing) return <Screen><PageHeader back="/automations" title="Automation" /><EmptyState icon="auto-mode" title="Automation not found" /></Screen>;
  if (!form) return null;

  return (
    <Screen maxWidth={1080}>
      <PageHeader
        back="/automations"
        title={isNew ? 'New automation' : existing!.name}
        subtitle={isNew ? 'Condition → action, with a cooldown between runs' : `Last triggered ${timeAgo(existing!.last_triggered_at)}`}
        actions={!isNew && can('automation.delete') ? <Button title="Delete" icon="delete-outline" variant="danger" size="sm" onPress={() => setDeleting(true)} disabled={!online} /> : null}
      />
      {!can('automation.edit') ? <Banner tone="info" icon="visibility" title="View-only" message="Your role can see automations but not change them." /> : null}
      {!online ? <Banner tone="warning" icon="cloud-off" title="Offline" message="Reconnect to save changes." /> : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1.4 : undefined, width: wide ? undefined : '100%', gap: 16 }}>
          <Card style={{ gap: 14 }}>
            <SectionTitle title="Details" />
            <TextField label="Name" value={form.name} onChangeText={(v) => set({ name: v })} editable={editable} placeholder="e.g. Cool the server room" error={errors.name} />
            <TextField label="Description" value={form.description} onChangeText={(v) => set({ description: v })} editable={editable} placeholder="What does this rule do and why?" multiline />
            <ToggleRow label="Enabled" description="Paused automations are never evaluated." value={form.enabled} onValueChange={(v) => set({ enabled: v })} disabled={!editable} />
          </Card>

          <Card style={{ gap: 14 }}>
            <SectionTitle title="If" subtitle="The condition that triggers this automation" />
            <Select
              label="Device"
              value={form.trigger_device_id}
              disabled={!editable}
              error={errors.trigger}
              onChange={(id) => {
                const d = ds.find((x) => x.id === id);
                set({ trigger_device_id: id, trigger_metric: d ? METRICS_BY_TYPE[d.type][0] : form.trigger_metric });
              }}
              options={ds.map((d) => ({ value: d.id, label: d.name, description: DEVICE_LABEL[d.type] }))}
            />
            <Select label="Measurement" value={form.trigger_metric} disabled={!editable} onChange={(v) => set({ trigger_metric: v as any })} options={metricOptions.map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1.3 }}>
                <Select
                  label="Comparison"
                  value={form.trigger_operator}
                  disabled={!editable}
                  onChange={(v) => set({ trigger_operator: v as any })}
                  options={(Object.keys(OPERATOR_LABEL) as (keyof typeof OPERATOR_LABEL)[]).map((k) => ({ value: k, label: OPERATOR_LABEL[k] }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={form.trigger_metric === 'temperature' ? 'Value (°C)' : form.trigger_metric === 'power' ? 'Value (W)' : form.trigger_metric === 'occupancy' ? 'People' : 'Value (%)'}
                  value={String(form.trigger_value)}
                  onChangeText={(v) => set({ trigger_value: v as any })}
                  keyboardType="decimal-pad"
                  editable={editable}
                  error={errors.value}
                />
              </View>
            </View>
          </Card>

          <Card style={{ gap: 14 }}>
            <SectionTitle title="Then" subtitle="What happens when the condition is met" />
            <Segmented
              disabled={!editable}
              value={form.action_kind}
              onChange={(k) => set({ action_kind: k, action_device_id: null, action_payload: k === 'set_power' ? { power: true } : k === 'set_temperature' ? { setpoint: 21 } : {} })}
              options={[
                { value: 'notify', label: 'Notify' },
                { value: 'set_temperature', label: 'Set temperature' },
                { value: 'set_power', label: 'Switch plug' },
              ]}
            />
            {form.action_kind !== 'notify' ? (
              <Select
                label={form.action_kind === 'set_power' ? 'Smart plug' : 'Thermostat'}
                value={form.action_device_id}
                disabled={!editable}
                error={errors.target}
                onChange={(v) => set({ action_device_id: v })}
                options={actionTargets.map((d) => ({ value: d.id, label: d.name }))}
              />
            ) : null}
            {form.action_kind === 'set_temperature' ? (
              <TextField
                label="Setpoint (°C)"
                value={String(form.action_payload?.setpoint ?? '')}
                onChangeText={(v) => set({ action_payload: { setpoint: v === '' ? '' : Number(v.replace(',', '.')) } })}
                keyboardType="decimal-pad"
                editable={editable}
                error={errors.setpoint}
              />
            ) : null}
            {form.action_kind === 'set_power' ? (
              <Segmented
                disabled={!editable}
                value={form.action_payload?.power ? 'on' : 'off'}
                onChange={(v) => set({ action_payload: { power: v === 'on' } })}
                options={[
                  { value: 'on', label: 'Turn on' },
                  { value: 'off', label: 'Turn off' },
                ]}
              />
            ) : null}
            {form.action_kind !== 'notify' ? (
              <ToggleRow label="Also notify the team" description="In-app notification plus enabled integrations." value={form.notify} onValueChange={(v) => set({ notify: v })} disabled={!editable} />
            ) : null}
            <TextField
              label="Cooldown between runs (minutes)"
              value={String(form.cooldown_minutes)}
              onChangeText={(v) => set({ cooldown_minutes: parseInt(v || '0', 10) })}
              keyboardType="number-pad"
              editable={editable}
              error={errors.cooldown}
              hint="After running, the rule waits this long (in simulated time) before it can run again."
            />
          </Card>
          {can('automation.edit') ? <Button title={isNew ? 'Create automation' : 'Save changes'} size="lg" onPress={() => save.mutate()} loading={save.isPending} disabled={!online} /> : null}
        </View>

        {!isNew ? (
          <Card style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
            <SectionTitle title="History" subtitle="Every evaluation that met the condition" />
            {(runs.data ?? []).map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                <View style={{ paddingVertical: 10, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Badge label={RUN_LABEL[r.status]} tone={RUN_TONE[r.status]} />
                    <Text style={type.small}>{formatDateTime(r.created_at)}</Text>
                  </View>
                  <Text style={[type.small, { color: colors.text }]}>{r.detail}</Text>
                  {r.trigger_value !== null ? <Text style={type.small}>Trigger value: {r.trigger_value}</Text> : null}
                </View>
              </View>
            ))}
            {runs.data && !runs.data.length ? <Text style={type.small}>This automation hasn’t run yet.</Text> : null}
          </Card>
        ) : null}
      </View>
      <ConfirmDialog
        visible={deleting}
        title="Delete automation?"
        message="Its run history will be deleted too."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
    </Screen>
  );
}
