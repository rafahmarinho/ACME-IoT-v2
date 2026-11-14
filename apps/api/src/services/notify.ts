import { admin } from '../lib/supabase.js';
import { rand } from '../lib/http.js';
import type { Severity } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

export async function logEvent(e: {
  org_id: string;
  device_id?: string | null;
  type: string;
  message: string;
  data?: Record<string, unknown>;
  actor_id?: string | null;
}) {
  await admin().from('events').insert({ data: {}, ...e });
}

/** Sends an in-app notification to every member of the org, honouring their alert preferences. */
export async function notifyMembers(orgId: string, n: { title: string; body: string; link?: string; severity: Severity }) {
  const db = admin();
  const { data: members } = await db.from('memberships').select('user_id').eq('org_id', orgId);
  if (!members?.length) return 0;
  const ids = members.map((m) => m.user_id);
  const { data: settings } = await db.from('user_settings').select('user_id, push_alerts, critical_only').in('user_id', ids);
  const prefs = new Map((settings ?? []).map((s) => [s.user_id, s]));
  const recipients = ids.filter((id) => {
    const p = prefs.get(id);
    if (!p) return true;
    if (!p.push_alerts) return false;
    return !p.critical_only || n.severity === 'critical';
  });
  if (recipients.length) {
    await db.from('notifications').insert(recipients.map((user_id) => ({ org_id: orgId, user_id, ...n })));
  }
  return recipients.length;
}

/**
 * Simulates delivering a payload to an external service (Slack, webhook, email...).
 * No network call is made — latency, status code and occasional failures are simulated.
 */
export async function simulateDelivery(integration: { id: string; org_id: string; provider: string; name: string }, summary: string) {
  const failed = Math.random() < 0.06;
  const latency = Math.round(rand(70, integration.provider === 'email' ? 900 : 380));
  const okCode = integration.provider === 'email' ? 250 : integration.provider === 'webhook' ? 202 : 200;
  const status_code = failed ? (Math.random() < 0.5 ? 503 : 429) : okCode;
  const status = failed ? 'failed' : 'delivered';
  const db = admin();
  await db.from('integration_deliveries').insert({
    org_id: integration.org_id,
    integration_id: integration.id,
    status,
    status_code,
    latency_ms: latency,
    summary,
  });
  await db.from('integrations').update({ last_delivery_at: new Date().toISOString(), last_status: status }).eq('id', integration.id);
  return { status, status_code, latency_ms: latency };
}

export async function forwardToIntegrations(orgId: string, severity: Severity, summary: string) {
  const { data: integrations } = await admin()
    .from('integrations')
    .select('id, org_id, provider, name, forward_severity')
    .eq('org_id', orgId)
    .eq('enabled', true);
  for (const i of integrations ?? []) {
    if (SEVERITY_RANK[severity] >= SEVERITY_RANK[i.forward_severity as Severity]) {
      await simulateDelivery(i, summary);
    }
  }
}

/** Opens an alert unless one of the same kind is already open for the device. */
export async function raiseAlert(a: {
  org_id: string;
  device_id: string | null;
  kind: string;
  severity: Severity;
  title: string;
  message: string;
}) {
  const db = admin();
  let q = db.from('alerts').select('id').eq('org_id', a.org_id).eq('kind', a.kind).neq('status', 'resolved');
  q = a.device_id ? q.eq('device_id', a.device_id) : q.is('device_id', null);
  const { data: existing } = await q.limit(1);
  if (existing?.length) return null;

  const { data: alert } = await db.from('alerts').insert(a).select('id').single();
  await notifyMembers(a.org_id, {
    title: a.title,
    body: a.message,
    severity: a.severity,
    link: a.device_id ? `/devices/${a.device_id}` : '/alerts',
  });
  await forwardToIntegrations(a.org_id, a.severity, a.title);
  return alert?.id ?? null;
}

export async function resolveAlerts(orgId: string, deviceId: string, kind: string) {
  await admin()
    .from('alerts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('device_id', deviceId)
    .eq('kind', kind)
    .neq('status', 'resolved');
}
