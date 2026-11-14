export type OrgRole = 'owner' | 'admin' | 'operator' | 'viewer';
export type DeviceType = 'thermostat' | 'smart_plug' | 'temperature_sensor' | 'humidity_sensor' | 'occupancy_sensor';
export type Severity = 'info' | 'warning' | 'critical';
export type Metric = 'temperature' | 'humidity' | 'occupancy' | 'power' | 'setpoint' | 'battery';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry: string;
  plan: string;
  timezone: string;
}

export interface Membership {
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  organizations?: Organization;
  profiles?: Profile;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  job_title: string;
  phone: string;
  avatar_url: string | null;
}

export interface UserSettings {
  user_id: string;
  default_org_id: string | null;
  temperature_unit: 'celsius' | 'fahrenheit';
  email_alerts: boolean;
  push_alerts: boolean;
  critical_only: boolean;
  auto_refresh_seconds: number;
}

export interface Building {
  id: string;
  org_id: string;
  name: string;
  address: string;
  city: string;
  floors: number;
  image_url: string | null;
  created_at: string;
}

export type RoomKind = 'office' | 'meeting' | 'lobby' | 'lab' | 'storage' | 'lounge' | 'server' | 'guest_room';

export interface Room {
  id: string;
  org_id: string;
  building_id: string;
  name: string;
  floor: number;
  kind: RoomKind;
  width_m: number;
  depth_m: number;
  target_temperature: number;
}

export interface Device {
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
  position_x: number;
  position_z: number;
  mount: 'wall' | 'ceiling' | 'desk' | 'floor';
  last_seen_at: string;
  created_at: string;
}

export interface Reading {
  id: number;
  device_id: string;
  metric: Metric;
  value: number;
  recorded_at: string;
}

export interface Command {
  id: string;
  device_id: string;
  kind: string;
  payload: Record<string, any>;
  status: 'pending' | 'delivered' | 'acknowledged' | 'failed' | 'expired';
  source: 'user' | 'automation' | 'system';
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Automation {
  id: string;
  org_id: string;
  name: string;
  description: string;
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
  created_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  status: 'executed' | 'skipped_cooldown' | 'failed';
  trigger_value: number | null;
  detail: string;
  created_at: string;
}

export interface Alert {
  id: string;
  org_id: string;
  device_id: string | null;
  kind: string;
  severity: Severity;
  title: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface EventRow {
  id: number;
  org_id: string;
  device_id: string | null;
  type: string;
  message: string;
  data: Record<string, any>;
  actor_id: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  org_id: string;
  title: string;
  body: string;
  link: string | null;
  severity: Severity;
  read_at: string | null;
  created_at: string;
}

export interface FirmwareRelease {
  id: string;
  device_type: DeviceType;
  version: string;
  channel: 'stable' | 'beta';
  notes: string;
  size_kb: number;
  released_at: string;
}

export interface FirmwareJob {
  id: string;
  device_id: string;
  release_id: string;
  from_version: string;
  to_version: string;
  status: 'queued' | 'downloading' | 'installing' | 'verifying' | 'succeeded' | 'failed' | 'rolled_back';
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  org_id: string;
  provider: 'slack' | 'webhook' | 'email' | 'pagerduty' | 'microsoft_teams';
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  forward_severity: Severity;
  last_delivery_at: string | null;
  last_status: string | null;
}

export interface IntegrationDelivery {
  id: string;
  integration_id: string;
  status: 'delivered' | 'failed';
  status_code: number;
  latency_ms: number;
  summary: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
}

export interface SimulationState {
  org_id: string;
  scenario: string;
  outdoor_temperature: number;
  sim_time: string;
  tick_count: number;
  auto_run: boolean;
  updated_at: string;
}
