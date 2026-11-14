import { onlineManager, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useOrg, useOrgId } from '@/providers/OrgProvider';
import { useAuth } from '@/providers/AuthProvider';
import {
  alertService,
  automationService,
  deviceService,
  eventService,
  firmwareService,
  integrationService,
  notificationService,
  simulationService,
  spaceService,
  teamService,
} from '@/services/db';
import type { Metric } from '@/types/db';

/** Live data refreshes on an interval (paused automatically in background/offline). */
function useLiveInterval() {
  const { settings } = useOrg();
  return (settings?.auto_refresh_seconds ?? 15) * 1000;
}

export function useBuildings() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['buildings', orgId], queryFn: () => spaceService.buildings(orgId), enabled: !!orgId });
}

export function useRooms() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['rooms', orgId], queryFn: () => spaceService.rooms(orgId), enabled: !!orgId });
}

export function useDevices() {
  const orgId = useOrgId();
  const interval = useLiveInterval();
  return useQuery({ queryKey: ['devices', orgId], queryFn: () => deviceService.list(orgId), enabled: !!orgId, refetchInterval: interval });
}

export function useReadings(deviceId: string | undefined, metric: Metric, hours = 24) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['readings', orgId, deviceId, metric, hours],
    queryFn: () => deviceService.readings(deviceId!, metric, hours),
    enabled: !!deviceId,
  });
}

export function useOrgReadings(metric: Metric, hours = 24) {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['room-readings', orgId, metric, hours], queryFn: () => deviceService.latestReadings(orgId, metric, hours), enabled: !!orgId });
}

export function useCommands(deviceId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['commands', orgId, deviceId], queryFn: () => deviceService.commands(deviceId!), enabled: !!deviceId });
}

export function useAutomations() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['automations', orgId], queryFn: () => automationService.list(orgId), enabled: !!orgId });
}

export function useAutomationRuns(automationId?: string) {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['automation-runs', orgId, automationId ?? 'all'], queryFn: () => automationService.runs(orgId, automationId), enabled: !!orgId });
}

export function useAlerts() {
  const orgId = useOrgId();
  const interval = useLiveInterval();
  return useQuery({ queryKey: ['alerts', orgId], queryFn: () => alertService.list(orgId), enabled: !!orgId, refetchInterval: interval * 2 });
}

export function useEvents(opts: { deviceId?: string; type?: string; search?: string; limit?: number } = {}) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['events', orgId, opts.deviceId ?? '', opts.type ?? '', opts.search ?? '', opts.limit ?? 150],
    queryFn: () => eventService.list(orgId, opts),
    enabled: !!orgId,
  });
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['notifications', user?.id], queryFn: () => notificationService.list(user!.id), enabled: !!user });
}

export function useFirmwareReleases() {
  return useQuery({ queryKey: ['firmware-releases'], queryFn: () => firmwareService.releases(), staleTime: 5 * 60_000 });
}

export function useFirmwareJobs() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['firmware-jobs', orgId], queryFn: () => firmwareService.jobs(orgId), enabled: !!orgId });
}

export function useIntegrations() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['integrations', orgId], queryFn: () => integrationService.list(orgId), enabled: !!orgId });
}

export function useIntegrationDeliveries(enabled: boolean) {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['integration-deliveries', orgId], queryFn: () => integrationService.deliveries(orgId), enabled: !!orgId && enabled });
}

export function useTeam() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['team', orgId], queryFn: () => teamService.members(orgId), enabled: !!orgId });
}

export function useInvitations(enabled: boolean) {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['invitations', orgId], queryFn: () => teamService.invitations(orgId), enabled: !!orgId && enabled });
}

export function useSimulation() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['simulation', orgId], queryFn: () => simulationService.state(orgId), enabled: !!orgId });
}

/** Reactive online status (NetInfo-backed). */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
