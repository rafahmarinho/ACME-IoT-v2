import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { EmptyState, ErrorState, PageHeader, Screen, SkeletonCards } from '@/components/ui/feedback';
import { Chips, SearchBar, Select } from '@/components/ui/forms';
import { Button, Card, Divider } from '@/components/ui/primitives';
import { AlertRow } from '@/components/ui/widgets';
import { useAlerts, useDevices, useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { alertService } from '@/services/db';
import type { Alert } from '@/types/db';

export default function Alerts() {
  const { org, can } = useOrg();
  const { user } = useAuth();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const alerts = useAlerts();
  const devices = useDevices();
  const [status, setStatus] = useState<'open' | 'acknowledged' | 'resolved' | 'all'>('open');
  const [severity, setSeverity] = useState('all');
  const [q, setQ] = useState('');

  const update = useMutation({
    mutationFn: ({ alert, action }: { alert: Alert; action: 'ack' | 'resolve' }) => (action === 'ack' ? alertService.acknowledge(alert.id, user!.id) : alertService.resolve(alert.id)),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['alerts', org?.id] });
      toast.show({ title: v.action === 'ack' ? 'Alert acknowledged' : 'Alert resolved', message: v.alert.title, tone: 'success' });
    },
    onError: (e) => toast.show({ title: 'Could not update alert', message: errorMessage(e), tone: 'danger' }),
  });

  const all = alerts.data ?? [];
  const list = useMemo(
    () =>
      all.filter(
        (a) =>
          (status === 'all' || a.status === status) &&
          (severity === 'all' || a.severity === severity) &&
          `${a.title} ${a.message}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [all, status, severity, q],
  );
  const name = (id: string | null) => devices.data?.find((d) => d.id === id)?.name;
  const canAct = can('alert.ack') && online;

  return (
    <Screen onRefresh={() => alerts.refetch()} refreshing={alerts.isRefetching}>
      <PageHeader title="Alerts" subtitle="Offline devices, low batteries, thresholds and failed updates" />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search alerts" />
      <Chips
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Open', count: all.filter((a) => a.status === 'open').length },
          { value: 'acknowledged', label: 'Acknowledged', count: all.filter((a) => a.status === 'acknowledged').length },
          { value: 'resolved', label: 'Resolved', count: all.filter((a) => a.status === 'resolved').length },
          { value: 'all', label: 'All', count: all.length },
        ]}
      />
      <View style={{ maxWidth: 280 }}>
        <Select
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={[
            { value: 'all', label: 'All severities' },
            { value: 'critical', label: 'Critical', icon: 'error' },
            { value: 'warning', label: 'Warning', icon: 'warning' },
            { value: 'info', label: 'Info', icon: 'info' },
          ]}
        />
      </View>
      {alerts.error && !alerts.data ? <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} /> : null}
      {alerts.isLoading && !alerts.data ? <SkeletonCards count={3} height={90} /> : null}
      {alerts.data && !list.length ? <EmptyState icon="notifications-off" title={status === 'open' ? 'No open alerts' : 'Nothing here'} message="You're all caught up." /> : null}
      {list.length ? (
        <Card>
          {list.map((a, i) => (
            <View key={a.id}>
              {i ? <Divider /> : null}
              <AlertRow
                alert={a}
                deviceName={name(a.device_id)}
                right={
                  canAct && a.status !== 'resolved' ? (
                    <View style={{ gap: 6 }}>
                      {a.status === 'open' ? <Button title="Acknowledge" size="sm" variant="secondary" onPress={() => update.mutate({ alert: a, action: 'ack' })} /> : null}
                      <Button title="Resolve" size="sm" variant="subtle" onPress={() => update.mutate({ alert: a, action: 'resolve' })} />
                    </View>
                  ) : null
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
