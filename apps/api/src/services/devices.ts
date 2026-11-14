import { admin, must } from '../lib/supabase.js';
import { HttpError, rand, round, sleep } from '../lib/http.js';
import { logEvent } from './notify.js';
import { DEVICE_LABEL, type DeviceRow, type DeviceType } from './types.js';

export type CommandKind = 'set_temperature' | 'set_mode' | 'set_power' | 'reboot';

const SUPPORTED: Record<CommandKind, DeviceType[]> = {
  set_temperature: ['thermostat'],
  set_mode: ['thermostat'],
  set_power: ['smart_plug'],
  reboot: ['thermostat', 'smart_plug', 'temperature_sensor', 'humidity_sensor', 'occupancy_sensor'],
};

export function describeCommand(kind: CommandKind, payload: Record<string, any>) {
  switch (kind) {
    case 'set_temperature':
      return `setpoint → ${payload.setpoint} °C`;
    case 'set_mode':
      return `mode → ${payload.mode}`;
    case 'set_power':
      return payload.power ? 'switched ON' : 'switched OFF';
    case 'reboot':
      return 'reboot requested';
  }
}

export function validatePayload(kind: CommandKind, payload: Record<string, any>) {
  if (kind === 'set_temperature') {
    const v = Number(payload.setpoint);
    if (!Number.isFinite(v) || v < 10 || v > 32) throw new HttpError(422, 'Setpoint must be between 10 °C and 32 °C.', 'invalid_setpoint');
    return { setpoint: round(v, 1) };
  }
  if (kind === 'set_mode') {
    if (!['heat', 'cool', 'auto', 'off'].includes(payload.mode)) throw new HttpError(422, 'Mode must be heat, cool, auto or off.', 'invalid_mode');
    return { mode: payload.mode };
  }
  if (kind === 'set_power') {
    if (typeof payload.power !== 'boolean') throw new HttpError(422, 'Power must be true or false.', 'invalid_power');
    return { power: payload.power };
  }
  return {};
}

/** Merges a command into the device's reported state, as the firmware would. */
export function applyToReported(device: DeviceRow, kind: CommandKind, payload: Record<string, any>) {
  const r = { ...device.reported_state };
  if (kind === 'set_temperature') r.setpoint = payload.setpoint;
  if (kind === 'set_mode') {
    r.mode = payload.mode;
    if (payload.mode === 'off') r.hvac = 'idle';
  }
  if (kind === 'set_power') {
    r.power = payload.power;
    r.watts = payload.power ? round(device.sim?.rated_watts ?? (r.watts > 0 ? r.watts : rand(60, 400)), 1) : 0;
  }
  return r;
}

/**
 * Sends a control command to a device over simulated HTTP.
 * The desired state is stored immediately; online devices acknowledge after a
 * short network delay, offline devices keep the command queued until reconnect.
 */
export async function sendCommand(opts: {
  device: DeviceRow;
  kind: CommandKind;
  payload: Record<string, any>;
  source: 'user' | 'automation' | 'system';
  actorId: string | null;
  waitForAck?: boolean;
}) {
  const { device, kind, source, actorId } = opts;
  if (!SUPPORTED[kind].includes(device.type)) {
    throw new HttpError(422, `${DEVICE_LABEL[device.type]} does not support ${kind}.`, 'unsupported_command');
  }
  const payload = validatePayload(kind, opts.payload);
  const db = admin();
  const desired = { ...device.desired_state, ...payload };
  if (kind === 'set_power' && !device.sim?.rated_watts && device.reported_state.watts > 0) {
    device.sim = { ...device.sim, rated_watts: device.reported_state.watts };
  }

  await db.from('devices').update({ desired_state: desired, sim: device.sim }).eq('id', device.id);
  const command = must(
    await db
      .from('commands')
      .insert({
        org_id: device.org_id,
        device_id: device.id,
        kind,
        payload,
        source,
        requested_by: actorId,
        status: device.status === 'online' ? 'delivered' : 'pending',
      })
      .select('*')
      .single(),
  );

  const what = `${device.name} ${describeCommand(kind, payload)}`;
  if (device.status === 'offline') {
    await logEvent({ org_id: device.org_id, device_id: device.id, type: 'command.queued', message: `${what} (queued — device offline)`, actor_id: actorId });
    return { command, status: 'pending' as const, message: 'Device is offline. The command is queued and will be applied when it reconnects.' };
  }

  // Simulated HTTP round-trip to the device gateway
  if (opts.waitForAck !== false) await sleep(rand(250, 700));
  const failed = Math.random() < 0.03;
  if (failed) {
    await db.from('commands').update({ status: 'failed', error: 'Device did not respond (timeout after 5s)', completed_at: new Date().toISOString() }).eq('id', command.id);
    await logEvent({ org_id: device.org_id, device_id: device.id, type: 'command.failed', message: `${what} failed — device timeout`, actor_id: actorId });
    return { command: { ...command, status: 'failed' }, status: 'failed' as const, message: 'The device did not respond in time. Desired state is saved and will be retried on the next sync.' };
  }

  const reported = applyToReported(device, kind, payload);
  await db.from('devices').update({ reported_state: reported, last_seen_at: new Date().toISOString() }).eq('id', device.id);
  await db.from('commands').update({ status: 'acknowledged', completed_at: new Date().toISOString() }).eq('id', command.id);
  if (kind === 'set_temperature') {
    await db.from('readings').insert({ org_id: device.org_id, device_id: device.id, metric: 'setpoint', value: payload.setpoint });
  }
  await logEvent({
    org_id: device.org_id,
    device_id: device.id,
    type: source === 'automation' ? 'automation.command' : 'command.acknowledged',
    message: what,
    actor_id: actorId,
  });
  return { command: { ...command, status: 'acknowledged' }, status: 'acknowledged' as const, message: 'Device confirmed the change.' };
}

/** Retries queued / failed commands for a device that is online again. */
export async function flushQueuedCommands(device: DeviceRow) {
  const db = admin();
  const { data: queued } = await db
    .from('commands')
    .select('*')
    .eq('device_id', device.id)
    .in('status', ['pending', 'delivered', 'failed'])
    .order('created_at');
  if (!queued?.length) return device;
  let reported = device.reported_state;
  for (const c of queued) {
    reported = applyToReported({ ...device, reported_state: reported }, c.kind, c.payload);
    await db.from('commands').update({ status: 'acknowledged', completed_at: new Date().toISOString(), error: null }).eq('id', c.id);
    await logEvent({ org_id: device.org_id, device_id: device.id, type: 'command.acknowledged', message: `${device.name} ${describeCommand(c.kind, c.payload)} (applied after sync)` });
  }
  return { ...device, reported_state: reported };
}

export function parseClaimCode(input: string) {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/[?&]code=([^&]+)/i);
  return decodeURIComponent(fromUrl ? fromUrl[1] : trimmed).toUpperCase().replace(/\s+/g, '');
}

export async function lookupClaim(code: string) {
  const { data } = await admin().from('device_registry').select('*').eq('claim_code', parseClaimCode(code)).maybeSingle();
  if (!data) throw new HttpError(404, 'We could not find a device with this code. Check the label and try again.', 'claim_not_found');
  if (data.claimed_org_id) throw new HttpError(409, 'This device is already registered to an organization.', 'already_claimed');
  return data as { serial: string; claim_code: string; type: DeviceType; model: string; firmware_version: string };
}

const INITIAL_STATE: Record<DeviceType, { desired: Record<string, any>; reported: Record<string, any>; battery: number | null; mount: string }> = {
  thermostat: { desired: { setpoint: 21.5, mode: 'auto' }, reported: { setpoint: 21.5, mode: 'auto', temperature: 21.2, humidity: 45, hvac: 'idle' }, battery: null, mount: 'wall' },
  smart_plug: { desired: { power: false }, reported: { power: false, watts: 0, energy_kwh: 0 }, battery: null, mount: 'floor' },
  temperature_sensor: { desired: {}, reported: { temperature: 21.4 }, battery: 100, mount: 'wall' },
  humidity_sensor: { desired: {}, reported: { humidity: 46 }, battery: 100, mount: 'wall' },
  occupancy_sensor: { desired: {}, reported: { occupied: false, count: 0 }, battery: 100, mount: 'ceiling' },
};

export async function claimDevice(opts: { orgId: string; code: string; roomId: string; name: string; actorId: string }) {
  const reg = await lookupClaim(opts.code);
  const db = admin();
  const { data: room } = await db.from('rooms').select('id, org_id, name').eq('id', opts.roomId).maybeSingle();
  if (!room || room.org_id !== opts.orgId) throw new HttpError(422, 'Choose a room in this organization.', 'invalid_room');

  const init = INITIAL_STATE[reg.type];
  const device = must(
    await db
      .from('devices')
      .insert({
        org_id: opts.orgId,
        room_id: room.id,
        serial: reg.serial,
        name: opts.name.trim() || `${DEVICE_LABEL[reg.type]} ${reg.serial.slice(-4)}`,
        type: reg.type,
        model: reg.model,
        firmware_version: reg.firmware_version,
        status: 'online',
        battery_level: init.battery,
        signal_strength: -50 - Math.round(rand(0, 15)),
        desired_state: init.desired,
        reported_state: init.reported,
        mount: init.mount,
        position_x: round(rand(0.2, 0.8), 2),
        position_z: round(rand(0.2, 0.8), 2),
        sim: reg.type === 'smart_plug' ? { rated_watts: round(rand(40, 600), 1) } : {},
      })
      .select('*')
      .single(),
  );
  await db.from('device_registry').update({ claimed_org_id: opts.orgId, claimed_at: new Date().toISOString() }).eq('serial', reg.serial);
  await logEvent({
    org_id: opts.orgId,
    device_id: device.id,
    type: 'device.claimed',
    message: `${device.name} (${reg.model}) added to ${room.name}`,
    actor_id: opts.actorId,
  });
  return device;
}
