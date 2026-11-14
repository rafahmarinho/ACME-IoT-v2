-- ACME IoT — demo data as a re-runnable function.
-- `public.reset_demo_data()` wipes the two demo organizations and recreates
-- buildings, rooms, 20 devices, 24h of readings, automations, alerts, events,
-- firmware, integrations and simulation state. Auth users are created by seed.sql.

create or replace function public.demo_id(p_key text)
returns uuid language sql immutable set search_path = ''
as $$ select md5('acme-iot-demo:' || p_key)::uuid $$;

create or replace function public.reset_demo_data()
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  acme uuid := demo_id('org:acme');
  bluefin uuid := demo_id('org:bluefin');
  u_olivia uuid := 'a1111111-1111-4111-8111-111111111111';
  u_marcus uuid := 'a2222222-2222-4222-8222-222222222222';
  u_priya uuid := 'a3333333-3333-4333-8333-333333333333';
  u_daniel uuid := 'a4444444-4444-4444-8444-444444444444';
  u_sofia uuid := 'a5555555-5555-4555-8555-555555555555';
  t_now timestamptz := date_trunc('minute', now());
  d record;
begin
  delete from public.organizations where id in (acme, bluefin);
  delete from public.device_registry where serial like 'ACM-%' or serial like 'BLF-%' or serial like 'NEW-%';
  delete from public.firmware_releases;

  -- Organizations -------------------------------------------------------------
  insert into public.organizations (id, name, slug, industry, plan, timezone) values
    (acme, 'Acme Corporation', 'acme', 'Technology', 'enterprise', 'America/New_York'),
    (bluefin, 'Bluefin Hotels', 'bluefin', 'Hospitality', 'business', 'Europe/Lisbon');

  insert into public.memberships (org_id, user_id, role)
  select v.org_id, v.user_id, v.role::public.org_role
  from (values
    (acme, u_olivia, 'owner'), (acme, u_marcus, 'admin'), (acme, u_priya, 'operator'), (acme, u_daniel, 'viewer'),
    (bluefin, u_sofia, 'owner'), (bluefin, u_olivia, 'admin'), (bluefin, u_priya, 'viewer')
  ) as v(org_id, user_id, role)
  where exists (select 1 from auth.users au where au.id = v.user_id);

  insert into public.invitations (org_id, email, role, invited_by) values
    (acme, 'new.hire@acme.test', 'operator', u_olivia);

  -- Buildings & rooms ---------------------------------------------------------
  insert into public.buildings (id, org_id, name, address, city, floors) values
    (demo_id('b:hq'), acme, 'Acme HQ Tower', '350 Fifth Avenue', 'New York, NY', 12),
    (demo_id('b:lab'), acme, 'Innovation Lab', '1 Kendall Square', 'Cambridge, MA', 3),
    (demo_id('b:harbor'), bluefin, 'Bluefin Harbor Hotel', 'Avenida 24 de Julho 52', 'Lisbon', 6);

  insert into public.rooms (id, org_id, building_id, name, floor, kind, width_m, depth_m, target_temperature) values
    (demo_id('r:board'), acme, demo_id('b:hq'), 'Executive Boardroom', 12, 'meeting', 9, 6, 21.5),
    (demo_id('r:7a'), acme, demo_id('b:hq'), 'Open Workspace 7A', 7, 'office', 12, 8, 22),
    (demo_id('r:server'), acme, demo_id('b:hq'), 'Server Room B1', 1, 'server', 6, 5, 19),
    (demo_id('r:proto'), acme, demo_id('b:lab'), 'Prototyping Lab', 2, 'lab', 9, 7, 21),
    (demo_id('r:lounge'), acme, demo_id('b:lab'), 'Quiet Lounge', 3, 'lounge', 7, 5, 22),
    (demo_id('r:lobby'), bluefin, demo_id('b:harbor'), 'Main Lobby', 1, 'lobby', 14, 9, 22),
    (demo_id('r:501'), bluefin, demo_id('b:harbor'), 'Suite 501', 5, 'guest_room', 8, 6, 23),
    (demo_id('r:hall'), bluefin, demo_id('b:harbor'), 'Atlantic Conference Hall', 2, 'meeting', 12, 9, 21);

  -- Firmware catalog ----------------------------------------------------------
  insert into public.firmware_releases (id, device_type, version, channel, notes, size_kb, released_at) values
    (demo_id('fw:th:2.3.1'), 'thermostat', '2.3.1', 'stable', 'Improved PID tuning for radiant floors.', 2048, now() - interval '120 days'),
    (demo_id('fw:th:2.4.0'), 'thermostat', '2.4.0', 'stable', 'Adaptive recovery, faster setpoint acknowledgements, security patches.', 2310, now() - interval '21 days'),
    (demo_id('fw:th:2.5.0'), 'thermostat', '2.5.0-beta', 'beta', 'Experimental humidity-aware comfort mode.', 2420, now() - interval '3 days'),
    (demo_id('fw:sp:1.8.0'), 'smart_plug', '1.8.0', 'stable', 'Energy metering calibration.', 812, now() - interval '200 days'),
    (demo_id('fw:sp:1.9.2'), 'smart_plug', '1.9.2', 'stable', 'Surge protection telemetry and relay wear reporting.', 845, now() - interval '30 days'),
    (demo_id('fw:ts:3.1.0'), 'temperature_sensor', '3.1.0', 'stable', 'Lower sampling jitter.', 512, now() - interval '150 days'),
    (demo_id('fw:ts:3.2.0'), 'temperature_sensor', '3.2.0', 'stable', '18% longer battery life.', 530, now() - interval '14 days'),
    (demo_id('fw:hs:3.1.0'), 'humidity_sensor', '3.1.0', 'stable', 'Condensation compensation.', 512, now() - interval '150 days'),
    (demo_id('fw:hs:3.2.0'), 'humidity_sensor', '3.2.0', 'stable', '18% longer battery life.', 530, now() - interval '14 days'),
    (demo_id('fw:os:1.2.0'), 'occupancy_sensor', '1.2.0', 'stable', 'Better PIR false-positive filtering.', 640, now() - interval '90 days'),
    (demo_id('fw:os:1.3.1'), 'occupancy_sensor', '1.3.1', 'stable', 'People counting accuracy +12%.', 702, now() - interval '10 days');

  -- Devices -------------------------------------------------------------------
  -- key, org, room, serial, name, type, model, fw, status, battery, desired, reported, x, z, mount
  insert into public.devices (id, org_id, room_id, serial, name, type, model, firmware_version, status, battery_level, signal_strength, desired_state, reported_state, position_x, position_z, mount, sim, last_seen_at)
  select demo_id('d:' || v.k), v.org, demo_id('r:' || v.room), v.serial, v.name, v.type::public.device_type, v.model, v.fw,
         v.status::public.connection_status, v.battery, v.rssi, v.desired::jsonb, v.reported::jsonb, v.x, v.z, v.mount, v.sim::jsonb,
         case when v.status = 'offline' then t_now - interval '47 minutes' else t_now end
  from (values
    -- Acme · Executive Boardroom
    ('board-th', acme, 'board', 'ACM-TH-0001', 'Boardroom Thermostat', 'thermostat', 'Acme Climate T100', '2.4.0', 'online', null::int, -48,
      '{"setpoint":21.5,"mode":"auto"}', '{"setpoint":21.5,"mode":"auto","temperature":21.8,"humidity":44,"hvac":"idle"}', 0.02, 0.5, 'wall', '{}'),
    ('board-occ', acme, 'board', 'ACM-OS-0001', 'Boardroom Presence', 'occupancy_sensor', 'Acme Sense O3', '1.3.1', 'online', 88, -52,
      '{}', '{"occupied":true,"count":6}', 0.5, 0.5, 'ceiling', '{}'),
    ('board-plug', acme, 'board', 'ACM-SP-0001', 'Display Wall Plug', 'smart_plug', 'Acme Plug P2', '1.9.2', 'online', null, -50,
      '{"power":true}', '{"power":true,"watts":142.5,"energy_kwh":312.4}', 0.5, 0.03, 'wall', '{}'),
    -- Acme · Open Workspace 7A
    ('7a-th', acme, '7a', 'ACM-TH-0002', 'Workspace 7A Thermostat', 'thermostat', 'Acme Climate T100', '2.3.1', 'online', null, -55,
      '{"setpoint":22,"mode":"cool"}', '{"setpoint":22,"mode":"cool","temperature":23.1,"humidity":51,"hvac":"cooling"}', 0.02, 0.35, 'wall', '{}'),
    ('7a-temp', acme, '7a', 'ACM-TS-0001', 'Window Bay Temperature', 'temperature_sensor', 'Acme Sense T1', '3.2.0', 'online', 74, -61,
      '{}', '{"temperature":24.2}', 0.85, 0.08, 'wall', '{}'),
    ('7a-hum', acme, '7a', 'ACM-HS-0001', 'Workspace Humidity', 'humidity_sensor', 'Acme Sense H1', '3.1.0', 'online', 63, -58,
      '{}', '{"humidity":52}', 0.6, 0.97, 'wall', '{}'),
    ('7a-occ', acme, '7a', 'ACM-OS-0002', 'Workspace Occupancy', 'occupancy_sensor', 'Acme Sense O3', '1.2.0', 'online', 41, -63,
      '{}', '{"occupied":true,"count":23}', 0.5, 0.5, 'ceiling', '{}'),
    ('7a-plug', acme, '7a', 'ACM-SP-0002', 'Coffee Machine', 'smart_plug', 'Acme Plug P2', '1.8.0', 'online', null, -57,
      '{"power":true}', '{"power":true,"watts":1210,"energy_kwh":845.1}', 0.92, 0.85, 'desk', '{}'),
    -- Acme · Server Room B1
    ('srv-temp', acme, 'server', 'ACM-TS-0002', 'Rack Inlet Temperature', 'temperature_sensor', 'Acme Sense T1', '3.1.0', 'online', 55, -66,
      '{}', '{"temperature":24.6}', 0.4, 0.3, 'wall', '{}'),
    ('srv-hum', acme, 'server', 'ACM-HS-0002', 'Server Room Humidity', 'humidity_sensor', 'Acme Sense H1', '3.1.0', 'online', 12, -70,
      '{}', '{"humidity":38}', 0.75, 0.97, 'wall', '{}'),
    ('srv-plug', acme, 'server', 'ACM-SP-0003', 'Backup CRAC Unit', 'smart_plug', 'Acme Plug P2 Pro', '1.9.2', 'online', null, -64,
      '{"power":false}', '{"power":false,"watts":0,"energy_kwh":1290.7}', 0.97, 0.7, 'floor', '{}'),
    -- Acme · Prototyping Lab
    ('proto-th', acme, 'proto', 'ACM-TH-0003', 'Lab Thermostat', 'thermostat', 'Acme Climate T100', '2.4.0', 'offline', null, -88,
      '{"setpoint":21,"mode":"heat"}', '{"setpoint":21,"mode":"heat","temperature":20.4,"humidity":40,"hvac":"idle"}', 0.02, 0.6, 'wall', '{"forced_offline":true}'),
    -- Bluefin · Main Lobby
    ('lobby-th', bluefin, 'lobby', 'BLF-TH-0001', 'Lobby Climate', 'thermostat', 'Acme Climate T100', '2.4.0', 'online', null, -50,
      '{"setpoint":22,"mode":"auto"}', '{"setpoint":22,"mode":"auto","temperature":22.4,"humidity":47,"hvac":"idle"}', 0.02, 0.5, 'wall', '{}'),
    ('lobby-occ', bluefin, 'lobby', 'BLF-OS-0001', 'Lobby Footfall', 'occupancy_sensor', 'Acme Sense O3', '1.3.1', 'online', 92, -49,
      '{}', '{"occupied":true,"count":14}', 0.5, 0.45, 'ceiling', '{}'),
    ('lobby-hum', bluefin, 'lobby', 'BLF-HS-0001', 'Lobby Humidity', 'humidity_sensor', 'Acme Sense H1', '3.2.0', 'online', 81, -54,
      '{}', '{"humidity":58}', 0.9, 0.97, 'wall', '{}'),
    -- Bluefin · Suite 501
    ('501-th', bluefin, '501', 'BLF-TH-0002', 'Suite 501 Thermostat', 'thermostat', 'Acme Climate T100', '2.3.1', 'online', null, -62,
      '{"setpoint":23,"mode":"heat"}', '{"setpoint":21,"mode":"heat","temperature":20.8,"humidity":45,"hvac":"heating"}', 0.02, 0.4, 'wall', '{}'),
    ('501-plug', bluefin, '501', 'BLF-SP-0001', 'Minibar Fridge', 'smart_plug', 'Acme Plug P2', '1.9.2', 'online', null, -60,
      '{"power":true}', '{"power":true,"watts":64.2,"energy_kwh":210.9}', 0.9, 0.12, 'floor', '{}'),
    ('501-temp', bluefin, '501', 'BLF-TS-0001', 'Suite Bedside Temperature', 'temperature_sensor', 'Acme Sense T1', '3.1.0', 'online', 19, -67,
      '{}', '{"temperature":21.0}', 0.3, 0.9, 'desk', '{}'),
    -- Bluefin · Atlantic Conference Hall
    ('hall-occ', bluefin, 'hall', 'BLF-OS-0002', 'Hall Occupancy', 'occupancy_sensor', 'Acme Sense O3', '1.2.0', 'online', 67, -58,
      '{}', '{"occupied":false,"count":0}', 0.5, 0.5, 'ceiling', '{}'),
    ('hall-plug', bluefin, 'hall', 'BLF-SP-0002', 'Stage Projector', 'smart_plug', 'Acme Plug P2 Pro', '1.8.0', 'online', null, -56,
      '{"power":true}', '{"power":true,"watts":318,"energy_kwh":402.3}', 0.5, 0.03, 'wall', '{}')
  ) as v(k, org, room, serial, name, type, model, fw, status, battery, rssi, desired, reported, x, z, mount, sim);

  -- Factory registry: the 20 claimed devices plus 6 unclaimed devices to onboard
  insert into public.device_registry (serial, claim_code, type, model, firmware_version, claimed_org_id, claimed_at)
  select d2.serial, 'CLM-' || upper(substr(md5(d2.serial), 1, 4)) || '-' || upper(substr(md5(d2.serial), 5, 4)),
         d2.type, d2.model, d2.firmware_version, d2.org_id, d2.created_at
  from public.devices d2 where d2.org_id in (acme, bluefin);

  insert into public.device_registry (serial, claim_code, type, model, firmware_version) values
    ('NEW-TH-1001', 'ACME-TH7Q-2K9X', 'thermostat', 'Acme Climate T100', '2.4.0'),
    ('NEW-SP-1002', 'ACME-SP4M-8RTZ', 'smart_plug', 'Acme Plug P2', '1.9.2'),
    ('NEW-TS-1003', 'ACME-TS9D-3LWE', 'temperature_sensor', 'Acme Sense T1', '3.2.0'),
    ('NEW-HS-1004', 'ACME-HS2B-6YQA', 'humidity_sensor', 'Acme Sense H1', '3.2.0'),
    ('NEW-OS-1005', 'ACME-OS5N-1CVF', 'occupancy_sensor', 'Acme Sense O3', '1.3.1'),
    ('NEW-SP-1006', 'ACME-SP8H-4JKD', 'smart_plug', 'Acme Plug P2 Pro', '1.9.2');

  -- 24h of readings (every 30 minutes) ---------------------------------------
  for d in select * from public.devices where org_id in (acme, bluefin) loop
    if d.type in ('thermostat', 'temperature_sensor') then
      insert into public.readings (org_id, device_id, metric, value, recorded_at)
      select d.org_id, d.id, 'temperature',
             round(((d.reported_state ->> 'temperature')::numeric + 1.4 * sin(g / 7.6) + (random() - 0.5) * 0.4)::numeric, 1),
             t_now - make_interval(mins => g * 30)
      from generate_series(1, 48) g
      where d.status = 'online' or g > 2;
    end if;
    if d.type = 'thermostat' then
      insert into public.readings (org_id, device_id, metric, value, recorded_at)
      select d.org_id, d.id, 'setpoint', (d.reported_state ->> 'setpoint')::numeric, t_now - make_interval(mins => g * 30)
      from generate_series(1, 48, 4) g;
    end if;
    if d.type in ('humidity_sensor', 'thermostat') then
      insert into public.readings (org_id, device_id, metric, value, recorded_at)
      select d.org_id, d.id, 'humidity',
             round(((d.reported_state ->> 'humidity')::numeric + 4 * sin(g / 9.0) + (random() - 0.5) * 1.5)::numeric, 0),
             t_now - make_interval(mins => g * 30)
      from generate_series(1, 48) g
      where d.status = 'online' or g > 2;
    end if;
    if d.type = 'occupancy_sensor' then
      insert into public.readings (org_id, device_id, metric, value, recorded_at)
      select d.org_id, d.id, 'occupancy',
             greatest(0, round((d.reported_state ->> 'count')::numeric * (0.5 + 0.5 * sin(g / 4.0)) + random() * 3)),
             t_now - make_interval(mins => g * 30)
      from generate_series(1, 48) g;
    end if;
    if d.type = 'smart_plug' then
      insert into public.readings (org_id, device_id, metric, value, recorded_at)
      select d.org_id, d.id, 'power',
             case when (d.reported_state ->> 'power')::boolean then round(((d.reported_state ->> 'watts')::numeric * (0.85 + random() * 0.3))::numeric, 1) else 0 end,
             t_now - make_interval(mins => g * 30)
      from generate_series(1, 48) g;
    end if;
    if d.battery_level is not null then
      insert into public.readings (org_id, device_id, metric, value, recorded_at)
      select d.org_id, d.id, 'battery', least(100, d.battery_level + g / 8), t_now - make_interval(mins => g * 30)
      from generate_series(1, 48, 6) g;
    end if;
  end loop;

  -- Pending command (desired ≠ reported) -------------------------------------
  insert into public.commands (org_id, device_id, kind, payload, status, source, requested_by, created_at)
  values (bluefin, demo_id('d:501-th'), 'set_temperature', '{"setpoint":23}', 'delivered', 'user', u_sofia, now() - interval '2 minutes');

  insert into public.commands (org_id, device_id, kind, payload, status, source, requested_by, created_at, completed_at) values
    (acme, demo_id('d:board-th'), 'set_temperature', '{"setpoint":21.5}', 'acknowledged', 'user', u_priya, now() - interval '3 hours', now() - interval '3 hours' + interval '4 seconds'),
    (acme, demo_id('d:7a-plug'), 'set_power', '{"power":true}', 'acknowledged', 'automation', null, now() - interval '9 hours', now() - interval '9 hours' + interval '2 seconds');

  -- Automations ---------------------------------------------------------------
  insert into public.automations (id, org_id, name, description, enabled, trigger_device_id, trigger_metric, trigger_operator, trigger_value,
                                  action_kind, action_device_id, action_payload, notify, cooldown_minutes, last_triggered_at, created_by) values
    (demo_id('a:crac'), acme, 'Start backup cooling when racks run hot', 'Turns on the backup CRAC unit if rack inlet temperature exceeds 27 °C.', true,
      demo_id('d:srv-temp'), 'temperature', 'gt', 27, 'set_power', demo_id('d:srv-plug'), '{"power":true}', true, 10, now() - interval '2 days', u_marcus),
    (demo_id('a:eco'), acme, 'Boardroom eco mode when empty', 'Lowers the boardroom setpoint to 19 °C when nobody is in the room.', true,
      demo_id('d:board-occ'), 'occupancy', 'eq', 0, 'set_temperature', demo_id('d:board-th'), '{"setpoint":19}', false, 30, now() - interval '14 hours', u_marcus),
    (demo_id('a:hum'), acme, 'Humidity watch — Workspace 7A', 'Notifies facilities when humidity rises above 65%.', true,
      demo_id('d:7a-hum'), 'humidity', 'gt', 65, 'notify', null, '{}', true, 60, null, u_olivia),
    (demo_id('a:battery'), acme, 'Server sensor battery check', 'Alerts the team when the server humidity sensor battery drops below 15%.', true,
      demo_id('d:srv-hum'), 'battery', 'lt', 15, 'notify', null, '{}', true, 240, now() - interval '1 hour', u_marcus),
    (demo_id('a:projector'), bluefin, 'Projector off when hall is empty', 'Saves energy by switching off the stage projector when the hall is empty.', true,
      demo_id('d:hall-occ'), 'occupancy', 'eq', 0, 'set_power', demo_id('d:hall-plug'), '{"power":false}', true, 20, null, u_sofia),
    (demo_id('a:suite'), bluefin, 'Suite 501 comfort recovery', 'Raises the suite setpoint to 23 °C if it gets colder than 19 °C.', false,
      demo_id('d:501-temp'), 'temperature', 'lt', 19, 'set_temperature', demo_id('d:501-th'), '{"setpoint":23}', true, 45, null, u_sofia);

  insert into public.automation_runs (org_id, automation_id, status, trigger_value, detail, created_at) values
    (acme, demo_id('a:crac'), 'executed', 27.6, 'Backup CRAC Unit switched ON', now() - interval '2 days'),
    (acme, demo_id('a:crac'), 'skipped_cooldown', 27.9, 'Cooldown active (10 min)', now() - interval '2 days' + interval '5 minutes'),
    (acme, demo_id('a:eco'), 'executed', 0, 'Boardroom Thermostat setpoint → 19 °C', now() - interval '14 hours'),
    (acme, demo_id('a:battery'), 'executed', 12, 'Notified 4 team members', now() - interval '1 hour');

  -- Alerts --------------------------------------------------------------------
  insert into public.alerts (org_id, device_id, kind, severity, title, message, status, created_at, acknowledged_by, acknowledged_at, resolved_at) values
    (acme, demo_id('d:proto-th'), 'device_offline', 'critical', 'Lab Thermostat is offline', 'No heartbeat received for 47 minutes.', 'open', now() - interval '47 minutes', null, null, null),
    (acme, demo_id('d:srv-hum'), 'low_battery', 'warning', 'Low battery: Server Room Humidity', 'Battery at 12%. Replace within 7 days.', 'open', now() - interval '1 hour', null, null, null),
    (acme, demo_id('d:srv-temp'), 'threshold', 'warning', 'Rack inlet temperature high', 'Rack Inlet Temperature reached 27.6 °C.', 'resolved', now() - interval '2 days', u_marcus, now() - interval '2 days' + interval '6 minutes', now() - interval '2 days' + interval '30 minutes'),
    (acme, demo_id('d:7a-th'), 'firmware_available', 'info', 'Firmware 2.4.0 available', 'Workspace 7A Thermostat runs 2.3.1.', 'acknowledged', now() - interval '20 days', u_olivia, now() - interval '19 days', null),
    (bluefin, demo_id('d:501-temp'), 'low_battery', 'warning', 'Low battery: Suite Bedside Temperature', 'Battery at 19%.', 'open', now() - interval '5 hours', null, null, null);

  -- Events --------------------------------------------------------------------
  insert into public.events (org_id, device_id, type, message, actor_id, created_at) values
    (acme, demo_id('d:proto-th'), 'device.offline', 'Lab Thermostat went offline', null, now() - interval '47 minutes'),
    (acme, demo_id('d:srv-hum'), 'device.battery_low', 'Server Room Humidity battery at 12%', null, now() - interval '1 hour'),
    (acme, demo_id('d:board-th'), 'command.acknowledged', 'Boardroom Thermostat setpoint → 21.5 °C', u_priya, now() - interval '3 hours'),
    (acme, demo_id('d:7a-plug'), 'automation.executed', 'Coffee Machine switched ON by schedule', null, now() - interval '9 hours'),
    (acme, demo_id('d:board-th'), 'automation.executed', 'Boardroom eco mode when empty → setpoint 19 °C', null, now() - interval '14 hours'),
    (acme, null, 'user.login', 'Olivia Bennett signed in', u_olivia, now() - interval '20 hours'),
    (acme, demo_id('d:board-plug'), 'firmware.succeeded', 'Display Wall Plug updated to 1.9.2', u_marcus, now() - interval '6 days'),
    (bluefin, demo_id('d:501-th'), 'command.sent', 'Suite 501 Thermostat setpoint → 23 °C (awaiting device)', u_sofia, now() - interval '2 minutes'),
    (bluefin, demo_id('d:501-temp'), 'device.battery_low', 'Suite Bedside Temperature battery at 19%', null, now() - interval '5 hours'),
    (bluefin, demo_id('d:lobby-occ'), 'device.reconnected', 'Lobby Footfall reconnected after 3 min', null, now() - interval '11 hours');

  -- Firmware history ----------------------------------------------------------
  insert into public.firmware_jobs (org_id, device_id, release_id, from_version, to_version, status, progress, started_by, created_at, updated_at) values
    (acme, demo_id('d:board-plug'), demo_id('fw:sp:1.9.2'), '1.8.0', '1.9.2', 'succeeded', 100, u_marcus, now() - interval '6 days', now() - interval '6 days'),
    (acme, demo_id('d:board-th'), demo_id('fw:th:2.4.0'), '2.3.1', '2.4.0', 'succeeded', 100, u_marcus, now() - interval '18 days', now() - interval '18 days');
  insert into public.firmware_jobs (org_id, device_id, release_id, from_version, to_version, status, progress, error, started_by, created_at, updated_at) values
    (bluefin, demo_id('d:lobby-occ'), demo_id('fw:os:1.3.1'), '1.2.0', '1.3.1', 'succeeded', 100, null, u_sofia, now() - interval '9 days', now() - interval '9 days'),
    (bluefin, demo_id('d:hall-plug'), demo_id('fw:sp:1.9.2'), '1.8.0', '1.9.2', 'rolled_back', 100, 'Checksum mismatch after install — restored 1.8.0', u_sofia, now() - interval '4 days', now() - interval '4 days');

  -- Integrations (simulated) --------------------------------------------------
  insert into public.integrations (id, org_id, provider, name, config, enabled, forward_severity, last_delivery_at, last_status) values
    (demo_id('i:slack'), acme, 'slack', 'Facilities on Slack', '{"channel":"#facilities-alerts","workspace":"acme-corp"}', true, 'warning', now() - interval '1 hour', 'delivered'),
    (demo_id('i:webhook'), acme, 'webhook', 'BMS Webhook', '{"url":"https://bms.acme.example/hooks/iot","secret_hint":"••••a91f"}', true, 'critical', now() - interval '47 minutes', 'delivered'),
    (demo_id('i:pd'), acme, 'pagerduty', 'PagerDuty — Data Center', '{"service":"DC-Cooling","routing_key_hint":"••••7c2e"}', false, 'critical', null, null),
    (demo_id('i:email'), bluefin, 'email', 'Night Manager Email', '{"recipients":"night.manager@bluefin.test"}', true, 'warning', now() - interval '5 hours', 'delivered'),
    (demo_id('i:teams'), bluefin, 'microsoft_teams', 'Ops Channel (Teams)', '{"channel":"Hotel Operations"}', true, 'critical', null, null);

  insert into public.integration_deliveries (org_id, integration_id, status, status_code, latency_ms, summary, created_at) values
    (acme, demo_id('i:slack'), 'delivered', 200, 182, 'Low battery: Server Room Humidity', now() - interval '1 hour'),
    (acme, demo_id('i:webhook'), 'delivered', 202, 96, 'Lab Thermostat is offline', now() - interval '47 minutes'),
    (bluefin, demo_id('i:email'), 'delivered', 250, 640, 'Low battery: Suite Bedside Temperature', now() - interval '5 hours');

  -- Notifications -------------------------------------------------------------
  insert into public.notifications (org_id, user_id, title, body, link, severity, created_at, read_at)
  select acme, m.user_id, 'Lab Thermostat is offline', 'No heartbeat received for 47 minutes.', '/devices/' || demo_id('d:proto-th'), 'critical', now() - interval '47 minutes', null
  from public.memberships m where m.org_id = acme;
  insert into public.notifications (org_id, user_id, title, body, link, severity, created_at, read_at)
  select acme, m.user_id, 'Server sensor battery check', 'Server Room Humidity battery at 12%.', '/automations/' || demo_id('a:battery'), 'warning', now() - interval '1 hour', null
  from public.memberships m where m.org_id = acme;
  insert into public.notifications (org_id, user_id, title, body, link, severity, created_at, read_at)
  select bluefin, m.user_id, 'Low battery: Suite Bedside Temperature', 'Battery at 19%.', '/devices/' || demo_id('d:501-temp'), 'warning', now() - interval '5 hours', now() - interval '4 hours'
  from public.memberships m where m.org_id = bluefin;

  -- Simulation state ----------------------------------------------------------
  insert into public.simulation_state (org_id, scenario, outdoor_temperature, sim_time, tick_count) values
    (acme, 'normal', 16.5, t_now, 0),
    (bluefin, 'normal', 19.0, t_now, 0);

  update public.user_settings set default_org_id = coalesce(default_org_id, case when user_id = u_sofia then bluefin else acme end)
  where user_id in (u_olivia, u_marcus, u_priya, u_daniel, u_sofia);
end;
$$;

revoke execute on function public.reset_demo_data() from public, anon, authenticated;
grant execute on function public.reset_demo_data() to service_role;
