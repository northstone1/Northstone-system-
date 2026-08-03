import { supabase } from "../supabaseClient";

function must(error) {
  if (error) throw error;
}

const mapLead = (l) => ({
  id: l.id,
  name: l.name,
  phone: l.phone || "",
  email: l.email || "",
  source: l.source,
  notes: l.notes || "",
  status: l.status,
  createdAt: l.created_at,
  referredByProjectId: l.referred_by_project_id || null,
  referralEntryId: l.referral_id || null,
});

export async function fetchLeads() {
  const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  must(error);
  return data.map(mapLead);
}

export async function insertLead({ name, phone, email, source, notes, referredByProjectId, referralEntryId }, createdBy) {
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name,
      phone,
      email,
      source,
      notes,
      referred_by_project_id: referredByProjectId || null,
      referral_id: referralEntryId || null,
      created_by: createdBy,
    })
    .select()
    .single();
  must(error);
  return mapLead(data);
}

export async function updateLeadStatus(id, status) {
  const { error } = await supabase.from("leads").update({ status }).eq("id", id);
  must(error);
}

export async function deleteLead(id) {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  must(error);
}

// Backup restore: preserves each lead's original id (unlike insertLead,
// which always creates a fresh one), and keeps referredByProjectId since
// projects are restored first with matching original ids. referralEntryId
// is dropped — project_referrals rows aren't part of a backup restore.
export async function restoreLeads(leads) {
  if (!leads?.length) return;
  const rows = leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone || null,
    email: l.email || null,
    source: l.source,
    notes: l.notes || null,
    status: l.status,
    referred_by_project_id: l.referredByProjectId || null,
  }));
  const { error } = await supabase.from("leads").upsert(rows);
  must(error);
}
