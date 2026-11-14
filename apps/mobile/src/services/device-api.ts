/** Device communication and simulation via the ACME IoT HTTP API (no MQTT broker). */
import { api } from '@/lib/api';
import type { Device, DeviceType, FirmwareJob } from '@/types/db';

export interface CommandResult {
  status: 'acknowledged' | 'pending' | 'failed';
  message: string;
}

export const deviceApi = {
  setTemperature: (deviceId: string, setpoint: number) =>
    api<CommandResult>('/api/devices/command', { deviceId, kind: 'set_temperature', payload: { setpoint } }),
  setMode: (deviceId: string, mode: 'heat' | 'cool' | 'auto' | 'off') =>
    api<CommandResult>('/api/devices/command', { deviceId, kind: 'set_mode', payload: { mode } }),
  setPower: (deviceId: string, power: boolean) => api<CommandResult>('/api/devices/command', { deviceId, kind: 'set_power', payload: { power } }),
  reboot: (deviceId: string) => api<CommandResult>('/api/devices/command', { deviceId, kind: 'reboot', payload: {} }),
  lookup: (code: string) => api<{ serial: string; type: DeviceType; model: string; firmware_version: string }>('/api/devices/lookup', { code }),
  claim: (orgId: string, code: string, roomId: string, name: string) => api<{ device: Device }>('/api/devices/claim', { orgId, code, roomId, name }),
  simulate: (orgId: string, deviceId: string, patch: { forcedOffline?: boolean; batteryLevel?: number }) =>
    api('/api/devices/simulate', { orgId, deviceId, ...patch }),
};

export interface TickSummary {
  steps: number;
  readings: number;
  wentOffline: number;
  reconnected: number;
  automations: number;
  firmware: number;
  alerts: number;
}

export const simulationApi = {
  tick: (orgId: string, steps = 1, auto = false) => api<{ skipped: boolean; summary?: TickSummary }>('/api/simulation/tick', { orgId, steps, auto }),
  scenario: (orgId: string, scenario: string) => api<{ summary?: TickSummary }>('/api/simulation/scenario', { orgId, scenario }),
  autoRun: (orgId: string, enabled: boolean) => api('/api/simulation/auto-run', { orgId, enabled }),
  reset: (orgId: string) => api<{ message: string }>('/api/simulation/reset', { orgId }),
};

export const firmwareApi = {
  rollout: (orgId: string, releaseId: string, deviceIds: string[]) =>
    api<{ jobs: FirmwareJob[]; skipped: number }>('/api/firmware/rollout', { orgId, releaseId, deviceIds }),
  rollback: (orgId: string, jobId: string) => api('/api/firmware/rollback', { orgId, jobId }),
};

export const integrationApi = {
  test: (orgId: string, integrationId: string) =>
    api<{ status: string; status_code: number; latency_ms: number }>('/api/integrations/test', { orgId, integrationId }),
};

export const teamApi = {
  invite: (orgId: string, email: string, role: string) => api<{ status: string; message: string }>('/api/team/invite', { orgId, email, role }),
};

export const SCENARIOS = [
  { key: 'normal', label: 'Normal operations', icon: 'wb-sunny', description: 'Typical weekday: stable climate, steady occupancy, rare disconnects.' },
  { key: 'heatwave', label: 'Heatwave', icon: 'local-fire-department', description: 'Outdoor temperature spikes. Rooms warm up and the server room runs hot.' },
  { key: 'network_outage', label: 'Network outage', icon: 'wifi-off', description: 'A building gateway drops. Its devices go offline for ~3 steps, then reconnect.' },
  { key: 'low_battery', label: 'Low batteries', icon: 'battery-alert', description: 'Several battery sensors drop below 15% and start raising alerts.' },
  { key: 'after_hours', label: 'After hours', icon: 'nights-stay', description: 'Everyone leaves: occupancy goes to zero and eco automations kick in.' },
  { key: 'busy_day', label: 'Busy day', icon: 'groups', description: 'Full rooms: occupancy, humidity and plug loads climb.' },
  { key: 'firmware_failure', label: 'Firmware failure', icon: 'system-update', description: 'The next firmware installs fail verification and roll back automatically.' },
] as const;
