import type { OrgRole } from '@/types/db';

export type Action =
  | 'device.control'
  | 'device.manage'
  | 'space.manage'
  | 'automation.edit'
  | 'automation.delete'
  | 'alert.ack'
  | 'firmware.view'
  | 'firmware.manage'
  | 'integration.manage'
  | 'team.manage'
  | 'simulation.run'
  | 'simulation.reset'
  | 'org.manage';

const MATRIX: Record<Action, OrgRole[]> = {
  'device.control': ['owner', 'admin', 'operator'],
  'device.manage': ['owner', 'admin'],
  'space.manage': ['owner', 'admin'],
  'automation.edit': ['owner', 'admin', 'operator'],
  'automation.delete': ['owner', 'admin'],
  'alert.ack': ['owner', 'admin', 'operator'],
  'firmware.view': ['owner', 'admin', 'operator'],
  'firmware.manage': ['owner', 'admin'],
  'integration.manage': ['owner', 'admin'],
  'team.manage': ['owner', 'admin'],
  'simulation.run': ['owner', 'admin', 'operator'],
  'simulation.reset': ['owner', 'admin'],
  'org.manage': ['owner', 'admin'],
};

export function can(role: OrgRole | null | undefined, action: Action) {
  return !!role && MATRIX[action].includes(role);
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<OrgRole, string> = {
  owner: 'Full access, including billing and other owners.',
  admin: 'Manage spaces, devices, firmware, integrations and team.',
  operator: 'Control devices, run automations and handle alerts.',
  viewer: 'Read-only access to dashboards, devices and history.',
};
