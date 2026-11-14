import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DeviceGlyph } from '@/components/devices/DeviceCard';
import { RequirePermission } from '@/components/navigation/RequirePermission';
import { Banner, ConfirmDialog, EmptyState, FormSheet, PageHeader, ProgressBar, Screen, SkeletonCards, useIsWide } from '@/components/ui/feedback';
import { Chips } from '@/components/ui/forms';
import { Badge, Button, Card, Divider, Icon, SectionTitle } from '@/components/ui/primitives';
import { useDevices, useFirmwareJobs, useFirmwareReleases, useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { DEVICE_LABEL, formatDateTime, timeAgo } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { firmwareApi, simulationApi } from '@/services/device-api';
import { colors, font, type } from '@/theme';
import type { DeviceType, FirmwareJob, FirmwareRelease } from '@/types/db';

const JOB_TONE = { queued: 'neutral', downloading: 'info', installing: 'primary', verifying: 'primary', succeeded: 'success', failed: 'danger', rolled_back: 'warning' } as const;
const JOB_LABEL = { queued: 'Queued', downloading: 'Downloading', installing: 'Installing', verifying: 'Verifying', succeeded: 'Succeeded', failed: 'Failed', rolled_back: 'Rolled back' } as const;
const ACTIVE = ['queued', 'downloading', 'installing', 'verifying'];

function compare(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function FirmwareInner() {
  const { org, can } = useOrg();
  const wide = useIsWide();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const releases = useFirmwareReleases();
  const jobs = useFirmwareJobs();
  const devices = useDevices();
  const [devType, setDevType] = useState<DeviceType | 'all'>('all');
  const [rollout, setRollout] = useState<FirmwareRelease | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rollbackJob, setRollbackJob] = useState<FirmwareJob | null>(null);
  const manage = can('firmware.manage') && online;

  const ds = devices.data ?? [];
  const latest = useMemo(() => {
    const m = new Map<DeviceType, FirmwareRelease>();
    for (const r of releases.data ?? []) if (r.channel === 'stable' && (!m.get(r.device_type) || compare(r.version, m.get(r.device_type)!.version) > 0)) m.set(r.device_type, r);
    return m;
  }, [releases.data]);
  const outdated = ds.filter((d) => latest.get(d.type) && compare(d.firmware_version, latest.get(d.type)!.version) < 0);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['firmware-jobs', org?.id] });
    qc.invalidateQueries({ queryKey: ['devices', org?.id] });
  };

  const start = useMutation({
    mutationFn: () => firmwareApi.rollout(org!.id, rollout!.id, selected),
    onSuccess: (r) => {
      invalidate();
      toast.show({ title: `Rollout started on ${r.jobs.length} device(s)`, message: r.skipped ? `${r.skipped} skipped (busy or already up to date).` : 'Advance the simulation to watch progress.', tone: 'success' });
      setRollout(null);
    },
    onError: (e) => toast.show({ title: 'Could not start rollout', message: errorMessage(e), tone: 'danger' }),
  });
  const rollback = useMutation({
    mutationFn: (j: FirmwareJob) => firmwareApi.rollback(org!.id, j.id),
    onSuccess: () => {
      invalidate();
      toast.show({ title: 'Rolled back', message: `Device restored to ${rollbackJob?.from_version}.`, tone: 'success' });
      setRollbackJob(null);
    },
    onError: (e) => toast.show({ title: 'Rollback failed', message: errorMessage(e), tone: 'danger' }),
  });
  const advance = useMutation({
    mutationFn: () => simulationApi.tick(org!.id, 1),
    onSuccess: invalidate,
    onError: (e) => toast.show({ title: 'Could not advance simulation', message: errorMessage(e), tone: 'danger' }),
  });

  const visibleReleases = (releases.data ?? []).filter((r) => devType === 'all' || r.device_type === devType);
  const allJobs = jobs.data ?? [];
  const active = allJobs.filter((j) => ACTIVE.includes(j.status));
  const eligible = rollout ? ds.filter((d) => d.type === rollout.device_type && d.firmware_version !== rollout.version) : [];

  return (
    <Screen onRefresh={() => (jobs.refetch(), releases.refetch())} refreshing={jobs.isRefetching}>
      <PageHeader
        title="Firmware"
        subtitle={`${outdated.length} device(s) behind the latest stable release`}
        actions={active.length && can('simulation.run') ? <Button title="Advance updates" icon="fast-forward" size="sm" variant="secondary" onPress={() => advance.mutate()} loading={advance.isPending} disabled={!online} /> : null}
      />
      {!can('firmware.manage') ? <Banner tone="info" icon="visibility" title="View-only" message="Only owners and administrators can start rollouts or roll back." /> : null}

      {active.length ? (
        <Card style={{ gap: 12 }}>
          <SectionTitle title="In progress" subtitle="Updates advance with each simulation step; offline devices pause" />
          {active.map((j) => {
            const d = ds.find((x) => x.id === j.device_id);
            return (
              <View key={j.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {d ? <DeviceGlyph type={d.type} size={32} dim={d.status === 'offline'} /> : null}
                  <Text style={[type.body, { flex: 1, fontFamily: font.medium }]} numberOfLines={1}>
                    {d?.name} · {j.from_version} → {j.to_version}
                  </Text>
                  <Badge label={d?.status === 'offline' ? 'Paused · offline' : JOB_LABEL[j.status]} tone={d?.status === 'offline' ? 'danger' : JOB_TONE[j.status]} />
                  {manage ? <Button title="Cancel" size="sm" variant="ghost" onPress={() => setRollbackJob(j)} /> : null}
                </View>
                <ProgressBar value={j.progress} />
              </View>
            );
          })}
        </Card>
      ) : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1.2 : undefined, width: wide ? undefined : '100%', gap: 12 }}>
          <SectionTitle title="Releases" />
          <Chips value={devType} onChange={setDevType} options={[{ value: 'all', label: 'All' }, ...(Object.keys(DEVICE_LABEL) as DeviceType[]).map((t) => ({ value: t, label: DEVICE_LABEL[t] }))]} />
          {releases.isLoading && !releases.data ? <SkeletonCards count={3} /> : null}
          {visibleReleases.map((r) => {
            const installed = ds.filter((d) => d.type === r.device_type && d.firmware_version === r.version).length;
            const candidates = ds.filter((d) => d.type === r.device_type && d.firmware_version !== r.version).length;
            const isLatest = latest.get(r.device_type)?.id === r.id;
            return (
              <Card key={r.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <DeviceGlyph type={r.device_type} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.h3}>
                      {DEVICE_LABEL[r.device_type]} {r.version}
                    </Text>
                    <Text style={type.small}>
                      Released {timeAgo(r.released_at)} · {(r.size_kb / 1024).toFixed(1)} MB
                    </Text>
                  </View>
                  {r.channel === 'beta' ? <Badge label="Beta" tone="warning" /> : isLatest ? <Badge label="Latest" tone="success" /> : null}
                </View>
                <Text style={type.small}>{r.notes}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={type.small}>
                    {installed} installed · {candidates} eligible
                  </Text>
                  {manage && candidates ? (
                    <Button
                      title="Roll out"
                      size="sm"
                      icon="rocket-launch"
                      onPress={() => {
                        setRollout(r);
                        setSelected(ds.filter((d) => d.type === r.device_type && d.firmware_version !== r.version && d.status === 'online').map((d) => d.id));
                      }}
                    />
                  ) : null}
                </View>
              </Card>
            );
          })}
        </View>
        <Card style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
          <SectionTitle title="Update history" />
          {jobs.isLoading && !jobs.data ? <SkeletonCards count={1} /> : null}
          {!allJobs.length && jobs.data ? <EmptyState icon="system-update-alt" title="No updates yet" /> : null}
          {allJobs.map((j, i) => {
            const d = ds.find((x) => x.id === j.device_id);
            return (
              <View key={j.id}>
                {i ? <Divider /> : null}
                <View style={{ paddingVertical: 10, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <Text style={[type.body, { fontFamily: font.medium, fontSize: 14, flex: 1 }]} numberOfLines={1}>
                      {d?.name ?? 'Removed device'}
                    </Text>
                    <Badge label={JOB_LABEL[j.status]} tone={JOB_TONE[j.status]} />
                  </View>
                  <Text style={type.small}>
                    {j.from_version} → {j.to_version} · {formatDateTime(j.created_at)}
                  </Text>
                  {j.error ? <Text style={[type.small, { color: colors.warning }]}>{j.error}</Text> : null}
                  {manage && j.status === 'succeeded' && d?.firmware_version === j.to_version ? (
                    <Button title={`Roll back to ${j.from_version}`} size="sm" variant="ghost" icon="history" onPress={() => setRollbackJob(j)} style={{ alignSelf: 'flex-start' }} />
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      <FormSheet visible={!!rollout} title={rollout ? `Roll out ${DEVICE_LABEL[rollout.device_type]} ${rollout.version}` : ''} onClose={() => setRollout(null)}>
        <Text style={type.small}>{rollout?.notes}</Text>
        <Text style={type.label}>Select devices ({selected.length})</Text>
        {eligible.map((d) => {
          const on = selected.includes(d.id);
          return (
            <Pressable
              key={d.id}
              onPress={() => setSelected((s) => (on ? s.filter((x) => x !== d.id) : [...s, d.id]))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primaryBorder : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }}
            >
              <Icon name={on ? 'check-box' : 'check-box-outline-blank'} color={on ? colors.primary : colors.textSubtle} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontFamily: font.medium }]}>{d.name}</Text>
                <Text style={type.small}>
                  Current {d.firmware_version} · {d.status}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <Banner tone="info" title="Automatic rollback" message="If a device fails its post-install health check, it is restored to the previous version automatically." />
        <Button title={`Start rollout on ${selected.length} device(s)`} size="lg" icon="rocket-launch" disabled={!selected.length} loading={start.isPending} onPress={() => start.mutate()} />
      </FormSheet>
      <ConfirmDialog
        visible={!!rollbackJob}
        title={rollbackJob && ACTIVE.includes(rollbackJob.status) ? 'Cancel this update?' : 'Roll back firmware?'}
        message={rollbackJob ? `The device will return to ${rollbackJob.from_version}.` : ''}
        confirmLabel={rollbackJob && ACTIVE.includes(rollbackJob.status) ? 'Cancel update' : 'Roll back'}
        destructive
        loading={rollback.isPending}
        onCancel={() => setRollbackJob(null)}
        onConfirm={() => rollbackJob && rollback.mutate(rollbackJob)}
      />
    </Screen>
  );
}

export default function Firmware() {
  return (
    <RequirePermission action="firmware.view">
      <FirmwareInner />
    </RequirePermission>
  );
}
