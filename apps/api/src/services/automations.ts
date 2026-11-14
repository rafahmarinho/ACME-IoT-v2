import { admin } from '../lib/supabase.js';
import { describeCommand, sendCommand } from './devices.js';
import { forwardToIntegrations, logEvent, notifyMembers } from './notify.js';
import type { AutomationRow, DeviceRow } from './types.js';

const OPS = {
  gt: (a: number, b: number) => a > b,
  gte: (a: number, b: number) => a >= b,
  lt: (a: number, b: number) => a < b,
  lte: (a: number, b: number) => a <= b,
  eq: (a: number, b: number) => a === b,
};

export const OPERATOR_LABEL = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' } as const;

export function metricValue(device: DeviceRow, metric: AutomationRow['trigger_metric']): number | null {
  const r = device.reported_state;
  switch (metric) {
    case 'temperature':
      return typeof r.temperature === 'number' ? r.temperature : null;
    case 'humidity':
      return typeof r.humidity === 'number' ? r.humidity : null;
    case 'occupancy':
      return typeof r.count === 'number' ? r.count : null;
    case 'power':
      return typeof r.watts === 'number' ? r.watts : null;
    case 'battery':
      return device.battery_level;
  }
}

/**
 * Evaluates every enabled automation against the latest device state.
 * A rule fires when its condition holds and its cooldown (in simulated time) has elapsed.
 */
export async function evaluateAutomations(orgId: string, devices: Map<string, DeviceRow>, simTime: Date) {
  const db = admin();
  const { data: rules } = await db.from('automations').select('*').eq('org_id', orgId).eq('enabled', true);
  const results: { id: string; status: string }[] = [];

  for (const rule of (rules ?? []) as AutomationRow[]) {
    const trigger = devices.get(rule.trigger_device_id);
    if (!trigger || trigger.status === 'offline') continue;
    const value = metricValue(trigger, rule.trigger_metric);
    if (value === null || !OPS[rule.trigger_operator](value, Number(rule.trigger_value))) continue;

    const last = rule.last_triggered_at ? new Date(rule.last_triggered_at).getTime() : 0;
    const cooling = last && simTime.getTime() - last < rule.cooldown_minutes * 60_000;
    if (cooling) {
      // Record the first skip in a cooldown window only, to keep history readable.
      const { data: lastRun } = await db
        .from('automation_runs')
        .select('status')
        .eq('automation_id', rule.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRun?.status !== 'skipped_cooldown') {
        await db.from('automation_runs').insert({
          org_id: orgId,
          automation_id: rule.id,
          status: 'skipped_cooldown',
          trigger_value: value,
          detail: `Condition met but cooldown is active (${rule.cooldown_minutes} min)`,
        });
      }
      results.push({ id: rule.id, status: 'skipped_cooldown' });
      continue;
    }

    let detail = '';
    let status: 'executed' | 'failed' = 'executed';
    try {
      if (rule.action_kind !== 'notify' && rule.action_device_id) {
        const target = devices.get(rule.action_device_id);
        if (!target) throw new Error('Target device no longer exists');
        const res = await sendCommand({
          device: target,
          kind: rule.action_kind,
          payload: rule.action_payload,
          source: 'automation',
          actorId: null,
          waitForAck: false,
        });
        // keep the in-memory copy in sync for later rules in the same tick
        const { data: fresh } = await db.from('devices').select('*').eq('id', target.id).single();
        if (fresh) devices.set(target.id, fresh as DeviceRow);
        detail = `${target.name} ${describeCommand(rule.action_kind, rule.action_payload)}${res.status === 'pending' ? ' (queued — offline)' : ''}`;
        if (res.status === 'failed') status = 'failed';
      }
      const shouldNotify = rule.notify || rule.action_kind === 'notify';
      if (shouldNotify) {
        const summary = `${trigger.name}: ${rule.trigger_metric} is ${value}`;
        const count = await notifyMembers(orgId, {
          title: rule.name,
          body: detail ? `${summary}. ${detail}.` : `${summary}.`,
          severity: 'warning',
          link: `/automations/${rule.id}`,
        });
        await forwardToIntegrations(orgId, 'warning', `${rule.name} — ${summary}`);
        detail = detail ? `${detail}; notified ${count} member(s)` : `Notified ${count} member(s)`;
      }
    } catch (err) {
      status = 'failed';
      detail = err instanceof Error ? err.message : 'Action failed';
    }

    await db.from('automation_runs').insert({ org_id: orgId, automation_id: rule.id, status, trigger_value: value, detail });
    await db.from('automations').update({ last_triggered_at: simTime.toISOString() }).eq('id', rule.id);
    await logEvent({
      org_id: orgId,
      device_id: trigger.id,
      type: status === 'executed' ? 'automation.executed' : 'automation.failed',
      message: `${rule.name} → ${detail}`,
    });
    results.push({ id: rule.id, status });
  }
  return results;
}
