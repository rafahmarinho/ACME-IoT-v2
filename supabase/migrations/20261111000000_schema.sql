-- ACME IoT — core schema
-- Organizations > Buildings > Rooms > Devices, with readings, commands,
-- automations, alerts, events, firmware, integrations and simulation state.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'operator', 'viewer');
create type public.device_type as enum ('thermostat', 'smart_plug', 'temperature_sensor', 'humidity_sensor', 'occupancy_sensor');
create type public.connection_status as enum ('online', 'offline');
create type public.command_status as enum ('pending', 'delivered', 'acknowledged', 'failed', 'expired');
create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');
create type public.firmware_job_status as enum ('queued', 'downloading', 'installing', 'verifying', 'succeeded', 'failed', 'rolled_back');
create type public.integration_provider as enum ('slack', 'webhook', 'email', 'pagerduty', 'microsoft_teams');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

-- ---------------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  job_title text not null default '',
  phone text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_org_id uuid,
  temperature_unit text not null default 'celsius' check (temperature_unit in ('celsius', 'fahrenheit')),
  email_alerts boolean not null default true,
  push_alerts boolean not null default true,
  critical_only boolean not null default false,
  auto_refresh_seconds int not null default 15 check (auto_refresh_seconds between 5 and 300),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text not null default '',
  plan text not null default 'business',
  timezone text not null default 'UTC',
  accent_color text not null default '#4F46E5',
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'viewer',
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invitations_email_idx on public.invitations (lower(email));

-- ---------------------------------------------------------------------------
-- Spaces
-- ---------------------------------------------------------------------------
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text not null default '',
  city text not null default '',
  floors int not null default 1,
  image_url text,
  created_at timestamptz not null default now()
);
create index buildings_org_idx on public.buildings (org_id);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  building_id uuid not null references public.buildings (id) on delete cascade,
  name text not null,
  floor int not null default 1,
  kind text not null default 'office' check (kind in ('office', 'meeting', 'lobby', 'lab', 'storage', 'lounge', 'server', 'guest_room')),
  width_m numeric not null default 8,
  depth_m numeric not null default 6,
  target_temperature numeric not null default 21.5,
  created_at timestamptz not null default now()
);
create index rooms_building_idx on public.rooms (building_id);
create index rooms_org_idx on public.rooms (org_id);

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------
-- Factory registry: every manufactured device and its claim code (QR payload).
-- Only the API (service role) reads this table.
create table public.device_registry (
  serial text primary key,
  claim_code text not null unique,
  type public.device_type not null,
  model text not null,
  firmware_version text not null,
  claimed_org_id uuid references public.organizations (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete set null,
  serial text not null unique,
  name text not null,
  type public.device_type not null,
  model text not null,
  firmware_version text not null,
  status public.connection_status not null default 'online',
  battery_level int check (battery_level between 0 and 100),
  signal_strength int not null default -55,
  -- desired state = what operators asked for; reported state = what the device says
  desired_state jsonb not null default '{}'::jsonb,
  reported_state jsonb not null default '{}'::jsonb,
  -- simulation knobs (force offline, fail next firmware, drain rate...)
  sim jsonb not null default '{}'::jsonb,
  position_x numeric not null default 0.5,
  position_z numeric not null default 0.5,
  mount text not null default 'wall' check (mount in ('wall', 'ceiling', 'desk', 'floor')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index devices_org_idx on public.devices (org_id);
create index devices_room_idx on public.devices (room_id);

create table public.readings (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  metric text not null check (metric in ('temperature', 'humidity', 'occupancy', 'power', 'setpoint', 'battery')),
  value numeric not null,
  recorded_at timestamptz not null default now()
);
create index readings_device_metric_idx on public.readings (device_id, metric, recorded_at desc);
create index readings_org_idx on public.readings (org_id, recorded_at desc);

create table public.commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  kind text not null check (kind in ('set_temperature', 'set_mode', 'set_power', 'reboot')),
  payload jsonb not null default '{}'::jsonb,
  status public.command_status not null default 'pending',
  source text not null default 'user' check (source in ('user', 'automation', 'system')),
  requested_by uuid references auth.users (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index commands_device_idx on public.commands (device_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Automations
-- ---------------------------------------------------------------------------
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text not null default '',
  enabled boolean not null default true,
  -- condition: a device metric compared to a threshold
  trigger_device_id uuid not null references public.devices (id) on delete cascade,
  trigger_metric text not null check (trigger_metric in ('temperature', 'humidity', 'occupancy', 'power', 'battery')),
  trigger_operator text not null check (trigger_operator in ('gt', 'gte', 'lt', 'lte', 'eq')),
  trigger_value numeric not null,
  -- action: command a device and/or notify the team
  action_kind text not null check (action_kind in ('set_temperature', 'set_power', 'notify')),
  action_device_id uuid references public.devices (id) on delete cascade,
  action_payload jsonb not null default '{}'::jsonb,
  notify boolean not null default true,
  cooldown_minutes int not null default 15 check (cooldown_minutes between 0 and 1440),
  last_triggered_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index automations_org_idx on public.automations (org_id);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  status text not null check (status in ('executed', 'skipped_cooldown', 'failed')),
  trigger_value numeric,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index automation_runs_idx on public.automation_runs (automation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Alerts, events, notifications
-- ---------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  device_id uuid references public.devices (id) on delete cascade,
  kind text not null,
  severity public.alert_severity not null default 'warning',
  title text not null,
  message text not null default '',
  status public.alert_status not null default 'open',
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_org_idx on public.alerts (org_id, created_at desc);

create table public.events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  device_id uuid references public.devices (id) on delete cascade,
  type text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index events_org_idx on public.events (org_id, created_at desc);
create index events_device_idx on public.events (device_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  link text,
  severity public.alert_severity not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Firmware
-- ---------------------------------------------------------------------------
create table public.firmware_releases (
  id uuid primary key default gen_random_uuid(),
  device_type public.device_type not null,
  version text not null,
  channel text not null default 'stable' check (channel in ('stable', 'beta')),
  notes text not null default '',
  size_kb int not null default 1024,
  released_at timestamptz not null default now(),
  unique (device_type, version)
);

create table public.firmware_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  release_id uuid not null references public.firmware_releases (id) on delete cascade,
  from_version text not null,
  to_version text not null,
  status public.firmware_job_status not null default 'queued',
  progress int not null default 0 check (progress between 0 and 100),
  error text,
  started_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index firmware_jobs_org_idx on public.firmware_jobs (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrations (simulated external services)
-- ---------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider public.integration_provider not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  forward_severity public.alert_severity not null default 'warning',
  last_delivery_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);
create index integrations_org_idx on public.integrations (org_id);

create table public.integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  status text not null check (status in ('delivered', 'failed')),
  status_code int not null,
  latency_ms int not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index integration_deliveries_idx on public.integration_deliveries (integration_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Simulation
-- ---------------------------------------------------------------------------
create table public.simulation_state (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  scenario text not null default 'normal',
  outdoor_temperature numeric not null default 18,
  sim_time timestamptz not null default now(),
  tick_count int not null default 0,
  auto_run boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Authorization helpers (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.org_role_of(p_org uuid)
returns public.org_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.memberships m
  where m.org_id = p_org and m.user_id = (select auth.uid())
$$;

create or replace function public.is_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()))
$$;

create or replace function public.has_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  )
$$;

create or replace function public.shares_org_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;

revoke execute on function public.org_role_of(uuid), public.is_member(uuid), public.has_role(uuid, public.org_role[]), public.shares_org_with(uuid) from public, anon;
grant execute on function public.org_role_of(uuid), public.is_member(uuid), public.has_role(uuid, public.org_role[]), public.shares_org_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile, settings, accept pending invitations
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;

  insert into public.memberships (org_id, user_id, role)
  select i.org_id, new.id, i.role from public.invitations i
  where lower(i.email) = lower(new.email) and i.status = 'pending'
  on conflict do nothing;

  update public.invitations set status = 'accepted'
  where lower(email) = lower(new.email) and status = 'pending';

  update public.user_settings s set default_org_id = (
    select m.org_id from public.memberships m where m.user_id = new.id order by m.created_at limit 1
  ) where s.user_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings for each row execute function public.touch_updated_at();
create trigger firmware_jobs_touch before update on public.firmware_jobs for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Reads: any member. Writes: by role. Device-facing writes (commands, claims,
-- firmware, simulation) go through the API with the service role.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.buildings enable row level security;
alter table public.rooms enable row level security;
alter table public.device_registry enable row level security;
alter table public.devices enable row level security;
alter table public.readings enable row level security;
alter table public.commands enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.alerts enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;
alter table public.firmware_releases enable row level security;
alter table public.firmware_jobs enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_deliveries enable row level security;
alter table public.simulation_state enable row level security;

-- profiles
create policy "profiles: read self or teammates" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- settings
create policy "settings: read self" on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: update self" on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- organizations
create policy "orgs: members read" on public.organizations for select to authenticated using (public.is_member(id));
create policy "orgs: owners/admins update" on public.organizations for update to authenticated
  using (public.has_role(id, '{owner,admin}')) with check (public.has_role(id, '{owner,admin}'));

-- memberships
create policy "memberships: members read" on public.memberships for select to authenticated using (public.is_member(org_id));
create policy "memberships: admins manage non-owners" on public.memberships for update to authenticated
  using (public.has_role(org_id, '{owner,admin}') and (role <> 'owner' or public.has_role(org_id, '{owner}')))
  with check (public.has_role(org_id, '{owner,admin}') and (role <> 'owner' or public.has_role(org_id, '{owner}')));
create policy "memberships: admins remove non-owners" on public.memberships for delete to authenticated
  using (public.has_role(org_id, '{owner,admin}') and (role <> 'owner' or public.has_role(org_id, '{owner}')) and user_id <> (select auth.uid()));

-- invitations
create policy "invitations: admins read" on public.invitations for select to authenticated using (public.has_role(org_id, '{owner,admin}'));
create policy "invitations: admins update" on public.invitations for update to authenticated
  using (public.has_role(org_id, '{owner,admin}')) with check (public.has_role(org_id, '{owner,admin}'));

-- buildings & rooms
create policy "buildings: members read" on public.buildings for select to authenticated using (public.is_member(org_id));
create policy "buildings: admins insert" on public.buildings for insert to authenticated with check (public.has_role(org_id, '{owner,admin}'));
create policy "buildings: admins update" on public.buildings for update to authenticated
  using (public.has_role(org_id, '{owner,admin}')) with check (public.has_role(org_id, '{owner,admin}'));
create policy "buildings: admins delete" on public.buildings for delete to authenticated using (public.has_role(org_id, '{owner,admin}'));

create policy "rooms: members read" on public.rooms for select to authenticated using (public.is_member(org_id));
create policy "rooms: admins insert" on public.rooms for insert to authenticated with check (public.has_role(org_id, '{owner,admin}'));
create policy "rooms: admins update" on public.rooms for update to authenticated
  using (public.has_role(org_id, '{owner,admin}')) with check (public.has_role(org_id, '{owner,admin}'));
create policy "rooms: admins delete" on public.rooms for delete to authenticated using (public.has_role(org_id, '{owner,admin}'));

-- devices (state changes happen via API; admins may rename / move / delete)
create policy "devices: members read" on public.devices for select to authenticated using (public.is_member(org_id));
create policy "devices: admins update" on public.devices for update to authenticated
  using (public.has_role(org_id, '{owner,admin}')) with check (public.has_role(org_id, '{owner,admin}'));
create policy "devices: admins delete" on public.devices for delete to authenticated using (public.has_role(org_id, '{owner,admin}'));

create policy "readings: members read" on public.readings for select to authenticated using (public.is_member(org_id));
create policy "commands: members read" on public.commands for select to authenticated using (public.is_member(org_id));

-- automations
create policy "automations: members read" on public.automations for select to authenticated using (public.is_member(org_id));
create policy "automations: operators insert" on public.automations for insert to authenticated with check (public.has_role(org_id, '{owner,admin,operator}'));
create policy "automations: operators update" on public.automations for update to authenticated
  using (public.has_role(org_id, '{owner,admin,operator}')) with check (public.has_role(org_id, '{owner,admin,operator}'));
create policy "automations: admins delete" on public.automations for delete to authenticated using (public.has_role(org_id, '{owner,admin}'));
create policy "automation_runs: members read" on public.automation_runs for select to authenticated using (public.is_member(org_id));

-- alerts
create policy "alerts: members read" on public.alerts for select to authenticated using (public.is_member(org_id));
create policy "alerts: operators update" on public.alerts for update to authenticated
  using (public.has_role(org_id, '{owner,admin,operator}')) with check (public.has_role(org_id, '{owner,admin,operator}'));

create policy "events: members read" on public.events for select to authenticated using (public.is_member(org_id));

-- notifications
create policy "notifications: read own" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: update own" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: delete own" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- firmware
create policy "firmware_releases: authenticated read" on public.firmware_releases for select to authenticated using (true);
create policy "firmware_jobs: members read" on public.firmware_jobs for select to authenticated using (public.is_member(org_id));

-- integrations
create policy "integrations: members read" on public.integrations for select to authenticated using (public.is_member(org_id));
create policy "integrations: admins insert" on public.integrations for insert to authenticated with check (public.has_role(org_id, '{owner,admin}'));
create policy "integrations: admins update" on public.integrations for update to authenticated
  using (public.has_role(org_id, '{owner,admin}')) with check (public.has_role(org_id, '{owner,admin}'));
create policy "integrations: admins delete" on public.integrations for delete to authenticated using (public.has_role(org_id, '{owner,admin}'));
create policy "integration_deliveries: admins read" on public.integration_deliveries for select to authenticated using (public.has_role(org_id, '{owner,admin}'));

create policy "simulation: members read" on public.simulation_state for select to authenticated using (public.is_member(org_id));

-- device_registry: no policies → only service role.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.devices, public.alerts, public.events, public.notifications,
  public.firmware_jobs, public.commands, public.simulation_state, public.automation_runs;

-- ---------------------------------------------------------------------------
-- Storage: avatars (public read, users write their own folder)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('building-photos', 'building-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: users upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: users update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: users delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "building photos: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'building-photos' and public.has_role(((storage.foldername(name))[1])::uuid, '{owner,admin}'));
create policy "building photos: admins update" on storage.objects for update to authenticated
  using (bucket_id = 'building-photos' and public.has_role(((storage.foldername(name))[1])::uuid, '{owner,admin}'));

-- Removing a device releases its claim code so it can be registered again.
create or replace function public.release_device_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.device_registry set claimed_org_id = null, claimed_at = null where serial = old.serial;
  return old;
end;
$$;
create trigger devices_release_claim after delete on public.devices for each row execute function public.release_device_claim();
