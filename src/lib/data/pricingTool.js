import { supabase } from "../supabaseClient";

function must(error) {
  if (error) throw error;
}

// ---- supplier contacts (one row per supplier) ----
export async function fetchSupplierContacts() {
  const { data, error } = await supabase.from("supplier_contacts").select("*");
  must(error);
  const bySupplier = {};
  for (const row of data) bySupplier[row.supplier_id] = row.contact || {};
  return bySupplier;
}

export async function saveSupplierContact(supplierId, contact) {
  const { error } = await supabase
    .from("supplier_contacts")
    .upsert({ supplier_id: supplierId, contact, updated_at: new Date().toISOString() });
  must(error);
}

// ---- saved quotes (standalone Job Pricing Tool saves) ----
export async function fetchSavedQuoteList() {
  const { data, error } = await supabase.from("saved_quotes").select("id, name, created_at").order("created_at", { ascending: false });
  must(error);
  return data.map((q) => ({ id: q.id, name: q.name, savedAt: q.created_at }));
}

export async function fetchSavedQuote(id) {
  const { data, error } = await supabase.from("saved_quotes").select("*").eq("id", id).single();
  must(error);
  return { id: data.id, name: data.name, itemState: data.item_state, poaState: data.poa_state };
}

export async function saveQuote(name, itemState, poaState, createdBy) {
  const { data, error } = await supabase
    .from("saved_quotes")
    .insert({ name, item_state: itemState, poa_state: poaState, created_by: createdBy })
    .select("id")
    .single();
  must(error);
  return data.id;
}

export async function deleteSavedQuote(id) {
  const { error } = await supabase.from("saved_quotes").delete().eq("id", id);
  must(error);
}
