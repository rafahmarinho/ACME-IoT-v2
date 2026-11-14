export type DeviceType = 'thermostat' | 'smart_plug' | 'temperature_sensor' | 'humidity_sensor' | 'occupancy_sensor';
export type Severity = 'info' | 'warning' | 'critical';

export interface DeviceRow {
  id: string;
  org_id: string;
  room_id: string | null;
  serial: string;
  name: string;
  type: DeviceType;
  model: string;
  firmware_version: string;
  status: 'online' | 'offline';
  battery_level: number | null;
  signal_strength: number;
  desired_state: Record<string, any>;
  reported_state: Record<string, any>;
  sim: Record<string, any>;
  last_seen_at: string;
}

export interface AutomationRow {
  id: string;
  org_id: string;
  name: string;
  enabled: boolean;
  trigger_device_id: string;
  trigger_metric: 'temperature' | 'humidity' | 'occupancy' | 'power' | 'battery';
  trigger_operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  trigger_value: number;
  action_kind: 'set_temperature' | 'set_power' | 'notify';
  action_device_id: string | null;
  action_payload: Record<string, any>;
  notify: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
}

export interface SimState {
  org_id: string;
  scenario: string;
  outdoor_temperature: number;
  sim_time: string;
  tick_count: number;
  auto_run: boolean;
  updated_at: string;
}

export const DEVICE_LABEL: Record<DeviceType, string> = {
  thermostat: 'Thermostat',
  smart_plug: 'Smart plug',
  temperature_sensor: 'Temperature sensor',
  humidity_sensor: 'Humidity sensor',
  occupancy_sensor: 'Occupancy sensor',
};
