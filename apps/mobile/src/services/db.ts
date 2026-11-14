/**
 * Database access layer. Reads go straight to Supabase (protected by RLS);
 * device-facing actions go through the ACME IoT API (see ./device-api.ts).
 */
import { supabase } from '@/lib/supabase';
import type {
  Alert,
  AppNotification,
  Automation,
  AutomationRun,
  Building,
  Command,
  Device,
  EventRow,
  FirmwareJob,
  FirmwareRelease,
  Integration,
  IntegrationDelivery,
  Invitation,
  Membership,
  Metric,
  Profile,
  Reading,
  Room,
  SimulationState,
  UserSettings,
} from '@/types/db';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---- Account ---------------------------------------------------------------
export const accountService = {
  async memberships(userId: string) {
    return unwrap(
      await supabase.from('memberships').select('org_id, user_id, role, created_at, organizations(*)').eq('user_id', userId).order('created_at'),
    ) as unknown as Membership[];
  },
  async profile(userId: string) {
    return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single()) as Profile;
  },
  async updateProfile(userId: string, patch: Partial<Profile>) {
    return unwrap(await supabase.from('profiles').update(patch).eq('id', userId).select('*').single()) as Profile;
  },
  async settings(userId: string) {
    return unwrap(await supabase.from('user_settings').select('*').eq('user_id', userId).single()) as UserSettings;
  },
  async updateSettings(userId: string, patch: Partial<UserSettings>) {
    return unwrap(await supabase.from('user_settings').update(patch).eq('user_id', userId).select('*').single()) as UserSettings;
  },
  async uploadAvatar(userId: string, uri: string, mimeType = 'image/jpeg') {
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const body = await (await fetch(uri)).arrayBuffer();
    const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: mimeType, upsert: true });
    if (error) throw new Error(error.message);
    const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    return accountService.updateProfile(userId, { avatar_url: url });
  },
};

// ---- Spaces ------------------------------------------------------------------
export const spaceService = {
  async buildings(orgId: string) {
    return unwrap(await supabase.from('buildings').select('*').eq('org_id', orgId).order('name')) as Building[];
  },
  async rooms(orgId: string) {
    return unwrap(await supabase.from('rooms').select('*').eq('org_id', orgId).order('floor', { ascending: false }).order('name')) as Room[];
  },
  async createBuilding(input: Omit<Building, 'id' | 'created_at' | 'image_url'>) {
    return unwrap(await supabase.from('buildings').insert(input).select('*').single()) as Building;
  },
  async updateBuilding(id: string, patch: Partial<Building>) {
    return unwrap(await supabase.from('buildings').update(patch).eq('id', id).select('*').single()) as Building;
  },
  async deleteBuilding(id: string) {
    unwrap(await supabase.from('buildings').delete().eq('id', id));
  },
  async createRoom(input: Omit<Room, 'id'>) {
    return unwrap(await supabase.from('rooms').insert(input).select('*').single()) as Room;
  },
  async updateRoom(id: string, patch: Partial<Room>) {
    return unwrap(await supabase.from('rooms').update(patch).eq('id', id).select('*').single()) as Room;
  },
  async deleteRoom(id: string) {
    unwrap(await supabase.from('rooms').delete().eq('id', id));
  },
};

// ---- Devices -----------------------------------------------------------------
export const deviceService = {
  async list(orgId: string) {
    return unwrap(await supabase.from('devices').select('*').eq('org_id', orgId).order('name')) as Device[];
  },
  async update(id: string, patch: Partial<Pick<Device, 'name' | 'room_id' | 'position_x' | 'position_z'>>) {
    return unwrap(await supabase.from('devices').update(patch).eq('id', id).select('*').single()) as Device;
  },
  async remove(id: string) {
    unwrap(await supabase.from('devices').delete().eq('id', id));
  },
  async readings(deviceId: string, metric: Metric, hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    return unwrap(
      await supabase
        .from('readings')
        .select('id, device_id, metric, value, recorded_at')
        .eq('device_id', deviceId)
        .eq('metric', metric)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(400),
    ) as Reading[];
  },
  async latestReadings(orgId: string, metric: Metric, hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    return unwrap(
      await supabase
        .from('readings')
        .select('id, device_id, metric, value, recorded_at')
        .eq('org_id', orgId)
        .eq('metric', metric)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(1000),
    ) as Reading[];
  },
  async commands(deviceId: string) {
    return unwrap(await supabase.from('commands').select('*').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(15)) as Command[];
  },
};

// ---- Automations ---------------------------------------------------------------
export type AutomationInput = Omit<Automation, 'id' | 'created_at' | 'last_triggered_at'>;
export const automationService = {
  async list(orgId: string) {
    return unwrap(await supabase.from('automations').select('*').eq('org_id', orgId).order('created_at')) as Automation[];
  },
  async runs(orgId: string, automationId?: string) {
    let q = supabase.from('automation_runs').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(50);
    if (automationId) q = q.eq('automation_id', automationId);
    return unwrap(await q) as AutomationRun[];
  },
  async create(input: AutomationInput, userId: string) {
    return unwrap(await supabase.from('automations').insert({ ...input, created_by: userId }).select('*').single()) as Automation;
  },
  async update(id: string, patch: Partial<AutomationInput>) {
    return unwrap(await supabase.from('automations').update(patch).eq('id', id).select('*').single()) as Automation;
  },
  async remove(id: string) {
    unwrap(await supabase.from('automations').delete().eq('id', id));
  },
};

// ---- Alerts, events, notifications ------------------------------------------------
export const alertService = {
  async list(orgId: string) {
    return unwrap(await supabase.from('alerts').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200)) as Alert[];
  },
  async acknowledge(id: string, userId: string) {
    return unwrap(
      await supabase.from('alerts').update({ status: 'acknowledged', acknowledged_by: userId, acknowledged_at: new Date().toISOString() }).eq('id', id).select('*').single(),
    ) as Alert;
  },
  async resolve(id: string) {
    return unwrap(await supabase.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id).select('*').single()) as Alert;
  },
};

export const eventService = {
  async list(orgId: string, opts: { deviceId?: string; type?: string; search?: string; limit?: number } = {}) {
    let q = supabase.from('events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(opts.limit ?? 150);
    if (opts.deviceId) q = q.eq('device_id', opts.deviceId);
    if (opts.type) q = q.like('type', `${opts.type}%`);
    if (opts.search) q = q.ilike('message', `%${opts.search}%`);
    return unwrap(await q) as EventRow[];
  },
};

export const notificationService = {
  async list(userId: string) {
    return unwrap(await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)) as AppNotification[];
  },
  async markRead(ids: string[]) {
    unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids));
  },
  async clear(userId: string) {
    unwrap(await supabase.from('notifications').delete().eq('user_id', userId));
  },
};

// ---- Firmware ------------------------------------------------------------------
export const firmwareService = {
  async releases() {
    return unwrap(await supabase.from('firmware_releases').select('*').order('released_at', { ascending: false })) as FirmwareRelease[];
  },
  async jobs(orgId: string) {
    return unwrap(await supabase.from('firmware_jobs').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100)) as FirmwareJob[];
  },
};

// ---- Integrations --------------------------------------------------------------
export const integrationService = {
  async list(orgId: string) {
    return unwrap(await supabase.from('integrations').select('*').eq('org_id', orgId).order('created_at')) as Integration[];
  },
  async deliveries(orgId: string) {
    return unwrap(
      await supabase.from('integration_deliveries').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(60),
    ) as IntegrationDelivery[];
  },
  async create(input: Pick<Integration, 'org_id' | 'provider' | 'name' | 'config' | 'forward_severity'>) {
    return unwrap(await supabase.from('integrations').insert(input).select('*').single()) as Integration;
  },
  async update(id: string, patch: Partial<Integration>) {
    return unwrap(await supabase.from('integrations').update(patch).eq('id', id).select('*').single()) as Integration;
  },
  async remove(id: string) {
    unwrap(await supabase.from('integrations').delete().eq('id', id));
  },
};

// ---- Team -------------------------------------------------------------------------
export const teamService = {
  async members(orgId: string) {
    const members = unwrap(await supabase.from('memberships').select('org_id, user_id, role, created_at').eq('org_id', orgId)) as Membership[];
    const ids = members.map((m) => m.user_id);
    const profiles = ids.length ? (unwrap(await supabase.from('profiles').select('*').in('id', ids)) as Profile[]) : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return members.map((m) => ({ ...m, profiles: byId.get(m.user_id) }));
  },
  async invitations(orgId: string) {
    return unwrap(await supabase.from('invitations').select('*').eq('org_id', orgId).eq('status', 'pending').order('created_at', { ascending: false })) as Invitation[];
  },
  async revokeInvitation(id: string) {
    unwrap(await supabase.from('invitations').update({ status: 'revoked' }).eq('id', id));
  },
  async setRole(orgId: string, userId: string, role: Membership['role']) {
    unwrap(await supabase.from('memberships').update({ role }).eq('org_id', orgId).eq('user_id', userId));
  },
  async remove(orgId: string, userId: string) {
    unwrap(await supabase.from('memberships').delete().eq('org_id', orgId).eq('user_id', userId));
  },
};

// ---- Simulation -------------------------------------------------------------------
export const simulationService = {
  async state(orgId: string) {
    return unwrap(await supabase.from('simulation_state').select('*').eq('org_id', orgId).maybeSingle()) as SimulationState | null;
  },
};
