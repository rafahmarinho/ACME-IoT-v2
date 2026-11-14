import type { Automation, Device } from '@/types/db';
import { formatMetric, formatTemp } from './format';

export const OPERATOR_LABEL = { gt: 'is above', gte: 'is at or above', lt: 'is below', lte: 'is at or below', eq: 'equals' } as const;
export const OPERATOR_SYMBOL = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' } as const;

export const METRICS_BY_TYPE: Record<Device['type'], Automation['trigger_metric'][]> = {
  thermostat: ['temperature', 'humidity'],
  smart_plug: ['power'],
  temperature_sensor: ['temperature', 'battery'],
  humidity_sensor: ['humidity', 'battery'],
  occupancy_sensor: ['occupancy', 'battery'],
};

export function describeTrigger(a: Automation, devices: Device[]) {
  const d = devices.find((x) => x.id === a.trigger_device_id);
  const value = a.trigger_metric === 'temperature' ? formatTemp(a.trigger_value) : formatMetric(a.trigger_metric, a.trigger_value);
  return `When ${d?.name ?? 'a deleted device'} ${a.trigger_metric} ${OPERATOR_LABEL[a.trigger_operator]} ${value}`;
}

export function describeAction(a: Automation, devices: Device[]) {
  const d = devices.find((x) => x.id === a.action_device_id);
  if (a.action_kind === 'notify') return 'Notify the team';
  if (a.action_kind === 'set_power') return `Turn ${a.action_payload?.power ? 'on' : 'off'} ${d?.name ?? 'a deleted device'}${a.notify ? ' and notify the team' : ''}`;
  return `Set ${d?.name ?? 'a deleted device'} to ${formatTemp(a.action_payload?.setpoint)}${a.notify ? ' and notify the team' : ''}`;
}
