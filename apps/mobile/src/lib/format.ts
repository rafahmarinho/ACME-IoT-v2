import type { Device, DeviceType, Metric, RoomKind } from '@/types/db';

let unit: 'celsius' | 'fahrenheit' = 'celsius';
export function setTemperatureUnit(u: 'celsius' | 'fahrenheit') {
  unit = u;
}
export function getTemperatureUnit() {
  return unit;
}

export function formatTemp(c: number | null | undefined, digits = 1) {
  if (c === null || c === undefined || Number.isNaN(Number(c))) return '—';
  const v = unit === 'fahrenheit' ? (Number(c) * 9) / 5 + 32 : Number(c);
  return `${v.toFixed(digits)}°${unit === 'fahrenheit' ? 'F' : 'C'}`;
}

export function formatMetric(metric: Metric | string, value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  switch (metric) {
    case 'temperature':
    case 'setpoint':
      return formatTemp(value);
    case 'humidity':
    case 'battery':
      return `${Math.round(value)}%`;
    case 'occupancy':
      return `${Math.round(value)} ${Math.round(value) === 1 ? 'person' : 'people'}`;
    case 'power':
      return value >= 1000 ? `${(value / 1000).toFixed(2)} kW` : `${Math.round(value)} W`;
    default:
      return String(value);
  }
}

export const METRIC_LABEL: Record<string, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  occupancy: 'Occupancy',
  power: 'Power draw',
  setpoint: 'Setpoint',
  battery: 'Battery',
};

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  // The simulated clock can run ahead of wall time; treat future timestamps as "now".
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const abs = diff;
  const future = false;
  const m = Math.round(abs / 60000);
  let s: string;
  if (abs < 45_000) return 'just now';
  if (m < 60) s = `${m} min`;
  else if (m < 60 * 24) s = `${Math.round(m / 60)} h`;
  else s = `${Math.round(m / 1440)} d`;
  return future ? `in ${s}` : `${s} ago`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const DEVICE_LABEL: Record<DeviceType, string> = {
  thermostat: 'Thermostat',
  smart_plug: 'Smart plug',
  temperature_sensor: 'Temperature sensor',
  humidity_sensor: 'Humidity sensor',
  occupancy_sensor: 'Occupancy sensor',
};

export const DEVICE_ICON: Record<DeviceType, string> = {
  thermostat: 'thermostat',
  smart_plug: 'power',
  temperature_sensor: 'device-thermostat',
  humidity_sensor: 'water-drop',
  occupancy_sensor: 'sensors',
};

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  office: 'Office',
  meeting: 'Meeting room',
  lobby: 'Lobby',
  lab: 'Lab',
  storage: 'Storage',
  lounge: 'Lounge',
  server: 'Server room',
  guest_room: 'Guest room',
};

/** The headline value for a device card. */
export function primaryReading(d: Device): { label: string; value: string } {
  const r = d.reported_state ?? {};
  switch (d.type) {
    case 'thermostat':
      return { label: `Set to ${formatTemp(r.setpoint)}`, value: formatTemp(r.temperature) };
    case 'smart_plug':
      return { label: r.power ? 'On' : 'Off', value: formatMetric('power', r.watts ?? 0) };
    case 'temperature_sensor':
      return { label: 'Temperature', value: formatTemp(r.temperature) };
    case 'humidity_sensor':
      return { label: 'Relative humidity', value: formatMetric('humidity', r.humidity) };
    case 'occupancy_sensor':
      return { label: r.occupied ? 'Occupied' : 'Vacant', value: `${r.count ?? 0}` };
  }
}

/** Keys where the desired state differs from what the device reported. */
export function pendingKeys(d: Device) {
  return Object.keys(d.desired_state ?? {}).filter((k) => JSON.stringify(d.desired_state[k]) !== JSON.stringify(d.reported_state?.[k]));
}

export function metricsFor(type: DeviceType): Metric[] {
  switch (type) {
    case 'thermostat':
      return ['temperature', 'humidity', 'setpoint'];
    case 'smart_plug':
      return ['power'];
    case 'temperature_sensor':
      return ['temperature', 'battery'];
    case 'humidity_sensor':
      return ['humidity', 'battery'];
    case 'occupancy_sensor':
      return ['occupancy', 'battery'];
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
