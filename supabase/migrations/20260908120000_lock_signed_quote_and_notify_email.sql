-- Client-facing quote acceptance: sign_project_proposal() already recorded
-- the typed name/timestamp and flipped status to 'Signed' server-side, but
-- had no guard against being called again on an already-signed project —
-- fine when it was staff-only, but the client portal now calls this RPC
-- directly, so a second call (retry, replay, or a client re-opening the
-- accept form via a stale tab) could silently overwrite who signed and
-- when. Add the same "can't touch this once it's past quote stage" guard
-- used elsewhere (see the owner-delete-restriction migration) directly in
-- the function, not just by hiding the accept form once signed in the UI.
create or replace function public.sign_project_proposal(p_project_id uuid, p_typed_signature text, p_client_name text)
returns public.projects
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.projects;
  v_code text;
  v_reward numeric(10, 2);
  v_already_signed boolean;
begin
  if not public.owns_project(p_project_id) then
    raise exception 'not authorized for this project';
  end if;
  if trim(p_typed_signature) = '' or trim(p_client_name) = '' then
    raise exception 'signature and client name are required';
  end if;

  select coalesce((signature ->> 'signed')::boolean, false) into v_already_signed
  from public.projects where id = p_project_id;
  if v_already_signed then
    raise exception 'this quote has already been accepted';
  end if;

  select referral_code into v_code from public.projects where id = p_project_id;
  if v_code is null then
    v_code := 'NORTH-' || upper(left(regexp_replace(split_part(p_client_name, ' ', 1), '[^A-Za-z]', '', 'g'), 6))
              || floor(1000 + random() * 9000)::int;
  end if;

  update public.projects
  set
    signature = jsonb_build_object(
      'clientName', p_client_name,
      'date', coalesce(signature ->> 'date', to_char(current_date, 'YYYY-MM-DD')),
      'agreed', true,
      'signed', true,
      'typedSignature', p_typed_signature
    ),
    status = 'Signed',
    referral_code = v_code
  where id = p_project_id
  returning * into v_row;

  if v_row.referred_by_project_id is not null and v_row.referral_entry_id is not null then
    select referral_reward_amount into v_reward from public.company_settings limit 1;
    update public.project_referrals
    set status = 'Rewarded', reward_amount = v_reward, rewarded_at = current_date
    where id = v_row.referral_entry_id;
  end if;

  return v_row;
end;
$$;
