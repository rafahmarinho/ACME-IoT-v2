import { admin, must } from '../lib/supabase.js';
import { HttpError, rand, round } from '../lib/http.js';
import { evaluateAutomations } from './automations.js';
import { flushQueuedCommands } from './devices.js';
import { progressFirmwareJobs } from './firmware.js';
import { logEvent, raiseAlert, resolveAlerts } from './notify.js';
import type { DeviceRow, SimState } from './types.js';

export const STEP_MINUTES = 5;

export const SCENARIOS = {
  normal: { label: 'Normal operations', outdoor: 17, description: 'Typical weekday: stable climate, steady occupancy, rare disconnects.' },
  heatwave: { label: 'Heatwave', outdoor: 37, description: 'Outdoor temperature spikes. Rooms warm up and the server room runs hot.' },
  network_outage: { label: 'Network outage', outdoor: 17, description: 'A building gateway drops. Its devices go offline for ~3 steps, then reconnect.' },
  low_battery: { label: 'Low batteries', outdoor: 17, description: 'Several battery sensors drop below 15% and start raising alerts.' },
  after_hours: { label: 'After hours', outdoor: 12, description: 'Everyone leaves: occupancy goes to zero and eco automations kick in.' },
  busy_day: { label: 'Busy day', outdoor: 22, description: 'Full rooms: occupancy, humidity and plug loads climb.' },
  firmware_failure: { label: 'Firmware failure', outdoor: 17, description: 'The next firmware installs fail verification and roll back automatically.' },
} as const;
export type Scenario = keyof typeof SCENARIOS;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

async function loadState(orgId: string): Promise<SimState> {
  const db = admin();
  const { data } = await db.from('simulation_state').select('*').eq('org_id', orgId).maybeSingle();
  if (data) return data as SimState;
  return must(await db.from('simulation_state').insert({ org_id: orgId }).select('*').single()) as SimState;
}

/** Moves one device forward one simulation step. Pure apart from randomness. */
function stepDevice(d: DeviceRow, ctx: { scenario: Scenario; outdoor: number; roomTemp: Map<string, number>; roomKind: Map<string, string> }) {
  const r = { ...d.reported_state };
  const kind = d.room_id ? ctx.roomKind.get(d.room_id) : undefined;
  const ambientPull = (ctx.outdoor - 21) * 0.04;
  const readings: { metric: string; value: number }[] = [];

  switch (d.type) {
    case 'thermostat': {
      const t = Number(r.temperature ?? 21);
      const sp = Number(r.setpoint ?? 21.5);
      let next = t + ambientPull + rand(-0.15, 0.15);
      let hvac = 'idle';
      if (r.mode !== 'off') {
        const diff = sp - t;
        if (diff > 0.3 && r.mode !== 'cool') hvac = 'heating';
        if (diff < -0.3 && r.mode !== 'heat') hvac = 'cooling';
        if (hvac !== 'idle') next += clamp(diff, -0.6, 0.6) * 0.8;
      }
      r.temperature = round(clamp(next, 5, 40));
      r.hvac = hvac;
      r.humidity = round(clamp(Number(r.humidity ?? 45) + rand(-1, 1) + (ctx.scenario === 'busy_day' ? 0.8 : 0), 20, 90), 0);
      if (d.room_id) ctx.roomTemp.set(d.room_id, r.temperature);
      readings.push({ metric: 'temperature', value: r.temperature }, { metric: 'humidity', value: r.humidity });
      break;
    }
    case 'temperature_sensor': {
      const base = d.room_id ? ctx.roomTemp.get(d.room_id) : undefined;
      let t = Number(r.temperature ?? 21);
      if (kind === 'server') {
        const heat = ctx.scenario === 'heatwave' ? 0.9 : 0.15;
        const cooling = d.sim?.cooling_on ? -1.1 : 0;
        t = t + heat + cooling + rand(-0.2, 0.2);
        t = clamp(t, 18, 38);
      } else if (base !== undefined) {
        t = t + (base + 0.6 - t) * 0.5 + rand(-0.2, 0.2);
      } else {
        t = t + ambientPull + (21.5 - t) * 0.15 + rand(-0.25, 0.25);
      }
      r.temperature = round(t);
      readings.push({ metric: 'temperature', value: r.temperature });
      break;
    }
    case 'humidity_sensor': {
      const push = ctx.scenario === 'busy_day' ? 2.2 : ctx.scenario === 'heatwave' ? 0.8 : 0;
      const mean = kind === 'server' ? 40 : 50;
      const h = Number(r.humidity ?? 45);
      r.humidity = round(clamp(h + (mean - h) * (push ? 0.02 : 0.12) + push + rand(-1.5, 1.5), 15, 95), 0);
      readings.push({ metric: 'humidity', value: r.humidity });
      break;
    }
    case 'occupancy_sensor': {
      const capacity = kind === 'lobby' ? 40 : kind === 'office' ? 30 : kind === 'meeting' ? 14 : kind === 'guest_room' ? 3 : 8;
      let target = capacity * (Math.random() < 0.15 ? 0 : rand(0.2, 0.7));
      if (ctx.scenario === 'after_hours') target = 0;
      if (ctx.scenario === 'busy_day') target = capacity * rand(0.85, 1);
      const count = Math.max(0, Math.round(Number(r.count ?? 0) + (target - Number(r.count ?? 0)) * 0.6));
      r.count = ctx.scenario === 'after_hours' ? 0 : count;
      r.occupied = r.count > 0;
      readings.push({ metric: 'occupancy', value: r.count });
      break;
    }
    case 'smart_plug': {
      if (r.power) {
        const rated = Number(d.sim?.rated_watts ?? (r.watts || 100));
        const load = ctx.scenario === 'busy_day' ? 1.15 : 1;
        r.watts = round(rated * load * rand(0.88, 1.08));
        r.energy_kwh = round(Number(r.energy_kwh ?? 0) + (r.watts * STEP_MINUTES) / 60 / 1000, 2);
      } else {
        r.watts = 0;
      }
      readings.push({ metric: 'power', value: r.watts });
      break;
    }
  }
  return { reported: r, readings };
}

export async function runTick(orgId: string, steps = 1, opts: { auto?: boolean } = {}) {
  const db = admin();
  let state = await loadState(orgId);

  // Auto-run ticks from several open clients are throttled server-side.
  if (opts.auto && Date.now() - new Date(state.updated_at).getTime() < 4000) {
    return { skipped: true, state };
  }

  const summary = { steps: 0, readings: 0, wentOffline: 0, reconnected: 0, automations: 0, firmware: 0, alerts: 0 };

  for (let s = 0; s < steps; s++) {
    const simTime = new Date(new Date(state.sim_time).getTime() + STEP_MINUTES * 60_000);
    const scenario = (state.scenario in SCENARIOS ? state.scenario : 'normal') as Scenario;
    const outdoor = round(SCENARIOS[scenario].outdoor + rand(-1.2, 1.2));

    const [{ data: devRows }, { data: rooms }] = await Promise.all([
      db.from('devices').select('*').eq('org_id', orgId),
      db.from('rooms').select('id, kind').eq('org_id', orgId),
    ]);
    const devices = new Map<string, DeviceRow>((devRows ?? []).map((d) => [d.id, d as DeviceRow]));
    const ctx = {
      scenario,
      outdoor,
      roomTemp: new Map<string, number>(),
      roomKind: new Map<string, string>((rooms ?? []).map((r) => [r.id, r.kind])),
    };

    // CRAC / cooling plugs in server rooms cool the room sensor
    const coolingRooms = new Set(
      [...devices.values()].filter((d) => d.type === 'smart_plug' && d.reported_state.power && d.room_id && ctx.roomKind.get(d.room_id) === 'server').map((d) => d.room_id),
    );

    // thermostats first so room sensors can follow them
    const ordered = [...devices.values()].sort((a, b) => (a.type === 'thermostat' ? -1 : 0) - (b.type === 'thermostat' ? -1 : 0));
    const readingRows: Record<string, unknown>[] = [];

    for (let device of ordered) {
      const sim: Record<string, any> = { ...device.sim, cooling_on: device.room_id ? coolingRooms.has(device.room_id) : false };
      let status = device.status;
      let battery = device.battery_level;

      // --- connectivity --------------------------------------------------
      if (sim.offline_ticks > 0) {
        sim.offline_ticks -= 1;
        status = 'offline';
      } else if (sim.forced_offline) {
        status = 'offline';
      } else if (battery !== null && battery <= 0) {
        status = 'offline';
      } else if (device.status === 'offline') {
        status = Math.random() < 0.6 ? 'online' : 'offline';
      } else {
        status = Math.random() < 0.006 ? 'offline' : 'online';
      }

      if (status === 'offline' && device.status === 'online') {
        summary.wentOffline++;
        await logEvent({ org_id: orgId, device_id: device.id, type: 'device.offline', message: `${device.name} went offline` });
        const id = await raiseAlert({
          org_id: orgId,
          device_id: device.id,
          kind: 'device_offline',
          severity: 'critical',
          title: `${device.name} is offline`,
          message: 'The device stopped responding to heartbeats.',
        });
        if (id) summary.alerts++;
      }
      if (status === 'online' && device.status === 'offline') {
        summary.reconnected++;
        const gap = Math.max(1, Math.round((simTime.getTime() - new Date(device.last_seen_at).getTime()) / 60_000));
        await logEvent({ org_id: orgId, device_id: device.id, type: 'device.reconnected', message: `${device.name} reconnected after ${gap} min` });
        await resolveAlerts(orgId, device.id, 'device_offline');
        device = await flushQueuedCommands({ ...device, status: 'online' });
      }

      const update: Record<string, unknown> = { status, sim };
      if (status === 'online') {
        const { reported, readings } = stepDevice({ ...device, sim }, ctx);
        // --- battery ---------------------------------------------------
        if (battery !== null) {
          const drain = device.sim?.drain ?? rand(0.05, 0.3);
          battery = Math.max(0, Math.round((battery - drain) * 10) / 10);
          battery = Math.round(battery);
          readings.push({ metric: 'battery', value: battery });
          if (battery < 15 && (device.battery_level ?? 100) >= 0) {
            const id = await raiseAlert({
              org_id: orgId,
              device_id: device.id,
              kind: 'low_battery',
              severity: battery < 5 ? 'critical' : 'warning',
              title: `Low battery: ${device.name}`,
              message: `Battery at ${battery}%. Replace soon to avoid data gaps.`,
            });
            if (id) {
              summary.alerts++;
              await logEvent({ org_id: orgId, device_id: device.id, type: 'device.battery_low', message: `${device.name} battery at ${battery}%` });
            }
          }
          update.battery_level = battery;
        }
        update.reported_state = reported;
        update.last_seen_at = simTime.toISOString();
        update.signal_strength = Math.round(clamp(device.signal_strength + rand(-3, 3), -92, -40));
        for (const r of readings) readingRows.push({ org_id: orgId, device_id: device.id, metric: r.metric, value: r.value, recorded_at: simTime.toISOString() });
        devices.set(device.id, { ...device, ...update, reported_state: reported, battery_level: battery, status } as DeviceRow);
      } else {
        devices.set(device.id, { ...device, status, sim } as DeviceRow);
      }
      await db.from('devices').update(update).eq('id', device.id);
    }

    if (readingRows.length) await db.from('readings').insert(readingRows);
    summary.readings += readingRows.length;

    summary.firmware += await progressFirmwareJobs(orgId, devices);
    const auto = await evaluateAutomations(orgId, devices, simTime);
    summary.automations += auto.filter((a) => a.status === 'executed').length;

    state = must(
      await db
        .from('simulation_state')
        .update({ sim_time: simTime.toISOString(), tick_count: state.tick_count + 1, outdoor_temperature: outdoor, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .select('*')
        .single(),
    ) as SimState;
    summary.steps++;
  }

  return { skipped: false, state, summary };
}

export async function applyScenario(orgId: string, scenario: Scenario, actorId: string) {
  if (!(scenario in SCENARIOS)) throw new HttpError(422, 'Unknown scenario.', 'invalid_scenario');
  const db = admin();
  const { data: devices } = await db.from('devices').select('*').eq('org_id', orgId);
  const list = (devices ?? []) as DeviceRow[];

  // Clear previous scenario knobs
  for (const d of list) {
    const { offline_ticks, fail_next_firmware, drain, ...rest } = d.sim ?? {};
    let sim: Record<string, any> = rest;
    const update: Record<string, unknown> = {};
    if (scenario === 'normal') {
      sim = { ...rest, forced_offline: false };
    }
    if (scenario === 'firmware_failure') sim.fail_next_firmware = true;
    if (scenario === 'low_battery' && d.battery_level !== null && ['humidity_sensor', 'temperature_sensor', 'occupancy_sensor'].includes(d.type)) {
      if (Math.random() < 0.6 || d.battery_level < 40) {
        update.battery_level = Math.round(rand(6, 14));
        sim.drain = 1.5;
      }
    }
    update.sim = sim;
    await db.from('devices').update(update).eq('id', d.id);
  }

  if (scenario === 'network_outage') {
    const { data: buildings } = await db.from('buildings').select('id, name').eq('org_id', orgId);
    const target = buildings?.[Math.floor(Math.random() * (buildings?.length ?? 1))];
    if (target) {
      const { data: rooms } = await db.from('rooms').select('id').eq('building_id', target.id);
      const roomIds = new Set((rooms ?? []).map((r) => r.id));
      for (const d of list.filter((x) => x.room_id && roomIds.has(x.room_id))) {
        const { data: fresh } = await db.from('devices').select('sim').eq('id', d.id).single();
        await db.from('devices').update({ sim: { ...(fresh?.sim ?? {}), offline_ticks: 3 } }).eq('id', d.id);
      }
      await logEvent({ org_id: orgId, type: 'gateway.down', message: `Gateway at ${target.name} stopped responding`, actor_id: actorId });
    }
  }

  await db
    .from('simulation_state')
    .upsert({ org_id: orgId, scenario, outdoor_temperature: SCENARIOS[scenario].outdoor, updated_at: new Date(0).toISOString() });
  await logEvent({ org_id: orgId, type: 'simulation.scenario', message: `Scenario set to “${SCENARIOS[scenario].label}”`, actor_id: actorId, data: { scenario } });
  return runTick(orgId, 1);
}

export async function setDeviceSimulation(orgId: string, deviceId: string, patch: { forced_offline?: boolean; battery_level?: number }, actorId: string) {
  const db = admin();
  const { data: d } = await db.from('devices').select('*').eq('id', deviceId).eq('org_id', orgId).maybeSingle();
  if (!d) throw new HttpError(404, 'Device not found.', 'not_found');
  const update: Record<string, unknown> = {};
  if (patch.forced_offline !== undefined) {
    update.sim = { ...d.sim, forced_offline: patch.forced_offline, offline_ticks: 0 };
    if (patch.forced_offline) {
      update.status = 'offline';
      await raiseAlert({ org_id: orgId, device_id: d.id, kind: 'device_offline', severity: 'critical', title: `${d.name} is offline`, message: 'Disconnected by the simulator.' });
      await logEvent({ org_id: orgId, device_id: d.id, type: 'device.offline', message: `${d.name} disconnected (simulated)`, actor_id: actorId });
    }
  }
  if (patch.battery_level !== undefined && d.battery_level !== null) update.battery_level = Math.round(clamp(patch.battery_level, 0, 100));
  await db.from('devices').update(update).eq('id', d.id);
  return { ok: true };
}
