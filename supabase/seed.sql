-- ACME IoT demo seed.
-- Creates five demo users (password: AcmeDemo!2026) and loads demo data.
-- Safe to run more than once.

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('a1111111-1111-4111-8111-111111111111'::uuid, 'owner@acme.test', 'Olivia Bennett', 'VP Workplace Operations'),
      ('a2222222-2222-4222-8222-222222222222'::uuid, 'admin@acme.test', 'Marcus Chen', 'Facilities Systems Admin'),
      ('a3333333-3333-4333-8333-333333333333'::uuid, 'operator@acme.test', 'Priya Patel', 'Building Operator'),
      ('a4444444-4444-4444-8444-444444444444'::uuid, 'viewer@acme.test', 'Daniel Silva', 'Energy Analyst'),
      ('a5555555-5555-4555-8555-555555555555'::uuid, 'owner@bluefin.test', 'Sofia Almeida', 'Hotel General Manager')
    ) as t(id, email, full_name, job_title)
  loop
    if not exists (select 1 from auth.users where id = u.id) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
        extensions.crypt('AcmeDemo!2026', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(),
        '', '', '', '', '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    end if;
    update public.profiles set full_name = u.full_name, job_title = u.job_title where id = u.id;
  end loop;
end $$;

select public.reset_demo_data();
