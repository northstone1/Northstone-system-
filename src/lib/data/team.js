import { supabase } from "../supabaseClient";

function must(error) {
  if (error) throw error;
}

const mapTeamMember = (t) => ({ id: t.id, name: t.name, role: t.role, phone: t.phone || "", email: t.email || "", color: t.color });

export async function fetchTeamMembers() {
  const { data, error } = await supabase.from("team_members").select("*").order("created_at", { ascending: true });
  must(error);
  return data.map(mapTeamMember);
}

export async function insertTeamMember({ name, role, phone, email, color }) {
  const { data, error } = await supabase.from("team_members").insert({ name, role, phone, email, color }).select().single();
  must(error);
  return mapTeamMember(data);
}

export async function deleteTeamMember(id) {
  const { error } = await supabase.from("team_members").delete().eq("id", id);
  must(error);
}

// Backup restore: preserves original ids.
export async function restoreTeamMembers(team) {
  if (!team?.length) return;
  const rows = team.map((t) => ({ id: t.id, name: t.name, role: t.role, phone: t.phone || null, email: t.email || null, color: t.color }));
  const { error } = await supabase.from("team_members").upsert(rows);
  must(error);
}
