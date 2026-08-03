import { supabase } from "../supabaseClient";

function must(error) {
  if (error) throw error;
}

const mapEvent = (e) => ({
  id: e.id,
  title: e.title,
  type: e.type,
  date: e.event_date,
  time: e.event_time || "",
  projectId: e.project_id || "",
  leadId: e.lead_id || "",
  notes: e.notes || "",
});

export async function fetchEvents() {
  const { data, error } = await supabase.from("calendar_events").select("*").order("event_date", { ascending: true });
  must(error);
  return data.map(mapEvent);
}

export async function insertEvent({ title, type, date, time, projectId, leadId, notes }, createdBy) {
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      title,
      type,
      event_date: date,
      event_time: time || null,
      project_id: projectId || null,
      lead_id: leadId || null,
      notes,
      created_by: createdBy,
    })
    .select()
    .single();
  must(error);
  return mapEvent(data);
}

export async function deleteEvent(id) {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  must(error);
}

// Backup restore: preserves original ids. Call this only after
// restoreLeads/projects have run, since project_id/lead_id are foreign
// keys — a reference to a not-yet-restored row would be rejected.
export async function restoreEvents(events) {
  if (!events?.length) return;
  const rows = events.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    event_date: e.date,
    event_time: e.time || null,
    project_id: e.projectId || null,
    lead_id: e.leadId || null,
    notes: e.notes || null,
  }));
  const { error } = await supabase.from("calendar_events").upsert(rows);
  must(error);
}
