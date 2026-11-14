import { z } from 'zod';
import { CAN_CONTROL, CAN_MANAGE } from '../lib/auth.js';
import { HttpError, route } from '../lib/http.js';
import { admin } from '../lib/supabase.js';
import { claimDevice, lookupClaim, sendCommand } from '../services/devices.js';
import { rollback, startRollout } from '../services/firmware.js';
import { logEvent, simulateDelivery } from '../services/notify.js';
import { applyScenario, runTick, SCENARIOS, setDeviceSimulation, type Scenario } from '../services/simulation.js';
import type { DeviceRow } from '../services/types.js';

// demo ids are md5-derived, so accept any 8-4-4-4-12 hex id (not only RFC 4122 versions)
const uuid = z.guid();

async function loadDevice(deviceId: string) {
  const { data } = await admin().from('devices').select('*').eq('id', deviceId).maybeSingle();
  if (!data) throw new HttpError(404, 'Device not found.', 'not_found');
  return data as DeviceRow;
}

export const deviceCommand = route(
  z.object({ deviceId: uuid, kind: z.enum(['set_temperature', 'set_mode', 'set_power', 'reboot']), payload: z.record(z.string(), z.any()).default({}) }),
  async ({ body, auth }) => {
    const device = await loadDevice(body.deviceId);
    await auth.requireRole(device.org_id, CAN_CONTROL);
    return sendCommand({ device, kind: body.kind, payload: body.payload, source: 'user', actorId: auth.userId });
  },
);

export const deviceLookup = route(z.object({ code: z.string().min(4) }), async ({ body }) => {
  const reg = await lookupClaim(body.code);
  return { serial: reg.serial, type: reg.type, model: reg.model, firmware_version: reg.firmware_version };
});

export const deviceClaim = route(
  z.object({ orgId: uuid, code: z.string().min(4), roomId: uuid, name: z.string().max(80).default('') }),
  async ({ body, auth }) => {
    await auth.requireRole(body.orgId, CAN_MANAGE);
    const device = await claimDevice({ ...body, actorId: auth.userId });
    return { device };
  },
);

export const deviceSimulate = route(
  z.object({ orgId: uuid, deviceId: uuid, forcedOffline: z.boolean().optional(), batteryLevel: z.number().min(0).max(100).optional() }),
  async ({ body, auth }) => {
    await auth.requireRole(body.orgId, CAN_CONTROL);
    return setDeviceSimulation(body.orgId, body.deviceId, { forced_offline: body.forcedOffline, battery_level: body.batteryLevel }, auth.userId);
  },
);

export const simulationTick = route(
  z.object({ orgId: uuid, steps: z.number().int().min(1).max(24).default(1), auto: z.boolean().default(false) }),
  async ({ body, auth }) => {
    await auth.requireRole(body.orgId, CAN_CONTROL);
    return runTick(body.orgId, body.steps, { auto: body.auto });
  },
);

export const simulationScenario = route(
  z.object({ orgId: uuid, scenario: z.enum(Object.keys(SCENARIOS) as [Scenario, ...Scenario[]]) }),
  async ({ body, auth }) => {
    await auth.requireRole(body.orgId, CAN_CONTROL);
    return applyScenario(body.orgId, body.scenario, auth.userId);
  },
);

export const simulationAutoRun = route(z.object({ orgId: uuid, enabled: z.boolean() }), async ({ body, auth }) => {
  await auth.requireRole(body.orgId, CAN_CONTROL);
  await admin().from('simulation_state').update({ auto_run: body.enabled }).eq('org_id', body.orgId);
  await logEvent({ org_id: body.orgId, type: 'simulation.auto_run', message: `Live simulation ${body.enabled ? 'started' : 'paused'}`, actor_id: auth.userId });
  return { ok: true };
});

export const simulationReset = route(z.object({ orgId: uuid }), async ({ body, auth }) => {
  await auth.requireRole(body.orgId, CAN_MANAGE);
  const { error } = await admin().rpc('reset_demo_data');
  if (error) throw new HttpError(500, `Reset failed: ${error.message}`, 'reset_failed');
  return { ok: true, message: 'Demo data restored for both demo organizations.' };
});

export const firmwareRollout = route(
  z.object({ orgId: uuid, releaseId: uuid, deviceIds: z.array(uuid).min(1).max(50) }),
  async ({ body, auth }) => {
    await auth.requireRole(body.orgId, CAN_MANAGE);
    return startRollout(body.orgId, body.releaseId, body.deviceIds, auth.userId);
  },
);

export const firmwareRollback = route(z.object({ orgId: uuid, jobId: uuid }), async ({ body, auth }) => {
  await auth.requireRole(body.orgId, CAN_MANAGE);
  return rollback(body.orgId, body.jobId, auth.userId);
});

export const integrationTest = route(z.object({ orgId: uuid, integrationId: uuid }), async ({ body, auth }) => {
  await auth.requireRole(body.orgId, CAN_MANAGE);
  const { data: integration } = await admin().from('integrations').select('*').eq('id', body.integrationId).eq('org_id', body.orgId).maybeSingle();
  if (!integration) throw new HttpError(404, 'Integration not found.', 'not_found');
  const result = await simulateDelivery(integration, `Test message from ACME IoT to ${integration.name}`);
  await logEvent({ org_id: body.orgId, type: 'integration.test', message: `Test delivery to ${integration.name}: ${result.status} (${result.status_code})`, actor_id: auth.userId });
  return result;
});

export const teamInvite = route(
  z.object({ orgId: uuid, email: z.string().email(), role: z.enum(['owner', 'admin', 'operator', 'viewer']) }),
  async ({ body, auth }) => {
    const myRole = await auth.requireRole(body.orgId, CAN_MANAGE);
    if (body.role === 'owner' && myRole !== 'owner') throw new HttpError(403, 'Only owners can invite other owners.', 'forbidden');
    const db = admin();
    const email = body.email.toLowerCase();

    const { data: existing } = await db.from('profiles').select('id, full_name').ilike('email', email).maybeSingle();
    if (existing) {
      const { error } = await db.from('memberships').insert({ org_id: body.orgId, user_id: existing.id, role: body.role });
      if (error) throw new HttpError(409, 'This person is already a member of the organization.', 'already_member');
      await logEvent({ org_id: body.orgId, type: 'team.member_added', message: `${existing.full_name || email} joined as ${body.role}`, actor_id: auth.userId });
      return { status: 'added', message: `${existing.full_name || email} now has access as ${body.role}.` };
    }

    const { data: pending } = await db.from('invitations').select('id').eq('org_id', body.orgId).ilike('email', email).eq('status', 'pending').maybeSingle();
    if (pending) throw new HttpError(409, 'An invitation is already pending for this email.', 'already_invited');
    await db.from('invitations').insert({ org_id: body.orgId, email, role: body.role, invited_by: auth.userId });
    // Email delivery is simulated: the invitee signs up with this address and is added automatically.
    await logEvent({ org_id: body.orgId, type: 'team.invited', message: `Invitation emailed to ${email} (${body.role})`, actor_id: auth.userId });
    return { status: 'invited', message: `Invitation sent to ${email}. They join automatically when they create an account.` };
  },
);

export const routes: Record<string, (req: Request) => Promise<Response>> = {
  '/api/devices/command': deviceCommand,
  '/api/devices/lookup': deviceLookup,
  '/api/devices/claim': deviceClaim,
  '/api/devices/simulate': deviceSimulate,
  '/api/simulation/tick': simulationTick,
  '/api/simulation/scenario': simulationScenario,
  '/api/simulation/auto-run': simulationAutoRun,
  '/api/simulation/reset': simulationReset,
  '/api/firmware/rollout': firmwareRollout,
  '/api/firmware/rollback': firmwareRollback,
  '/api/integrations/test': integrationTest,
  '/api/team/invite': teamInvite,
};
