import { admin } from '../lib/supabase.js';
import { HttpError, rand } from '../lib/http.js';
import { logEvent, raiseAlert } from './notify.js';
import type { DeviceRow } from './types.js';

const ACTIVE = ['queued', 'downloading', 'installing', 'verifying'];

export async function startRollout(orgId: string, releaseId: string, deviceIds: string[], actorId: string) {
  const db = admin();
  const { data: release } = await db.from('firmware_releases').select('*').eq('id', releaseId).maybeSingle();
  if (!release) throw new HttpError(404, 'Firmware release not found.', 'not_found');

  const { data: devices } = await db.from('devices').select('*').eq('org_id', orgId).in('id', deviceIds);
  const { data: active } = await db.from('firmware_jobs').select('device_id').eq('org_id', orgId).in('status', ACTIVE);
  const busy = new Set((active ?? []).map((j) => j.device_id));

  const eligible = ((devices ?? []) as DeviceRow[]).filter(
    (d) => d.type === release.device_type && d.firmware_version !== release.version && !busy.has(d.id),
  );
  if (!eligible.length) throw new HttpError(422, 'No selected device can install this release (wrong type, already updated or busy).', 'no_eligible_devices');

  const { data: jobs } = await db
    .from('firmware_jobs')
    .insert(
      eligible.map((d) => ({
        org_id: orgId,
        device_id: d.id,
        release_id: release.id,
        from_version: d.firmware_version,
        to_version: release.version,
        started_by: actorId,
      })),
    )
    .select('*');
  for (const d of eligible) {
    await logEvent({ org_id: orgId, device_id: d.id, type: 'firmware.queued', message: `${d.name}: firmware ${release.version} queued`, actor_id: actorId });
  }
  return { jobs: jobs ?? [], skipped: deviceIds.length - eligible.length };
}

/** Advances queued/running jobs by one step. Offline devices pause their update. */
export async function progressFirmwareJobs(orgId: string, devices: Map<string, DeviceRow>) {
  const db = admin();
  const { data: jobs } = await db.from('firmware_jobs').select('*').eq('org_id', orgId).in('status', ACTIVE);
  let changed = 0;

  for (const job of jobs ?? []) {
    const device = devices.get(job.device_id);
    if (!device || device.status === 'offline') continue;

    let progress = Math.min(100, job.progress + Math.round(rand(18, 34)));
    let status = progress < 45 ? 'downloading' : progress < 85 ? 'installing' : progress < 100 ? 'verifying' : 'succeeded';
    let error: string | null = null;

    const shouldFail = device.sim?.fail_next_firmware || Math.random() < 0.05;
    if (status === 'succeeded' && shouldFail) {
      status = 'rolled_back';
      error = 'Post-install health check failed — automatically restored previous version';
      progress = 100;
      await db.from('devices').update({ sim: { ...device.sim, fail_next_firmware: false } }).eq('id', device.id);
      await logEvent({ org_id: orgId, device_id: device.id, type: 'firmware.failed', message: `${device.name}: ${job.to_version} failed verification` });
      await logEvent({ org_id: orgId, device_id: device.id, type: 'firmware.rolled_back', message: `${device.name} rolled back to ${job.from_version}` });
      await raiseAlert({
        org_id: orgId,
        device_id: device.id,
        kind: 'firmware_failed',
        severity: 'warning',
        title: `Firmware update failed on ${device.name}`,
        message: `${job.to_version} failed verification. The device was rolled back to ${job.from_version}.`,
      });
    } else if (status === 'succeeded') {
      await db.from('devices').update({ firmware_version: job.to_version }).eq('id', device.id);
      devices.set(device.id, { ...device, firmware_version: job.to_version });
      await logEvent({ org_id: orgId, device_id: device.id, type: 'firmware.succeeded', message: `${device.name} updated to ${job.to_version}` });
    }

    await db.from('firmware_jobs').update({ progress, status, error }).eq('id', job.id);
    changed++;
  }
  return changed;
}

/** Cancels an in-flight job or reverts a successful one to the previous version. */
export async function rollback(orgId: string, jobId: string, actorId: string) {
  const db = admin();
  const { data: job } = await db.from('firmware_jobs').select('*, devices(name, firmware_version)').eq('id', jobId).eq('org_id', orgId).maybeSingle();
  if (!job) throw new HttpError(404, 'Firmware job not found.', 'not_found');
  if (!['succeeded', ...ACTIVE].includes(job.status)) throw new HttpError(409, 'This job was already rolled back or failed.', 'invalid_state');

  await db.from('devices').update({ firmware_version: job.from_version }).eq('id', job.device_id);
  await db.from('firmware_jobs').update({ status: 'rolled_back', error: 'Rolled back by operator' }).eq('id', job.id);
  await logEvent({
    org_id: orgId,
    device_id: job.device_id,
    type: 'firmware.rolled_back',
    message: `${job.devices?.name ?? 'Device'} rolled back from ${job.to_version} to ${job.from_version}`,
    actor_id: actorId,
  });
  return { ok: true };
}
