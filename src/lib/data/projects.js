import { supabase } from "../supabaseClient";
import { deletePhoto, PROJECT_PHOTOS_BUCKET } from "./storage";

// ============================================================
// Mapping: DB rows (snake_case, relational children) <-> the UI project
// shape NorthstoneSystem.jsx already reads/writes (camelCase, nested
// arrays embedded on the project object). Centralised here so the rest of
// the app never has to think about column names.
// ============================================================

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

const mapVisual = (v) => ({ id: v.id, path: v.storage_path, caption: v.caption || "" });
const mapSiteUpdate = (u) => ({ id: u.id, caption: u.caption || "", stage: u.stage || "", photo: u.storage_path, date: (u.created_at || "").slice(0, 10) });
const mapVariation = (v) => ({ id: v.id, title: v.title, description: v.description || "", amount: Number(v.amount) || 0, status: v.status, date: (v.created_at || "").slice(0, 10), respondedAt: v.responded_at || null });
const mapReferral = (r) => ({ id: r.id, name: r.name, phone: r.phone || "", email: r.email || "", notes: r.notes || "", submittedAt: (r.created_at || "").slice(0, 10), status: r.status, rewardAmount: r.reward_amount, rewardedAt: r.rewarded_at });
const mapMessage = (m) => ({ id: m.id, from: m.sender, text: m.body, when: m.created_at });
const mapTicket = (t) => ({ id: t.id, subject: t.subject, description: t.description || "", status: t.status, createdAt: (t.created_at || "").slice(0, 10), resolvedAt: t.resolved_at ? t.resolved_at.slice(0, 10) : null });

const EMPTY_SURVEY = { info: {}, measurements: [], photos: {}, services: {}, vision: { style: [], notes: "" } };
const EMPTY_PRICING = { itemState: {}, poaState: {}, collapsed: {}, customItems: [] };
const EMPTY_PROPOSAL = { welcomeMessage: "", highlights: [], validityDays: 30, warrantyYears: 5, durationWeeks: "" };
const EMPTY_SIGNATURE = { clientName: "", date: "", agreed: false, signed: false, typedSignature: "" };
const EMPTY_TIMELINE = { prep: 0, ground: 0, landscaping: 0, structures: 0, finishing: 0, handover: 0 };

function nonEmpty(obj, fallback) {
  return obj && typeof obj === "object" && Object.keys(obj).length ? obj : fallback;
}

function mapProjectFromDb(row, children) {
  const visuals = children.visuals || [];
  return {
    id: row.id,
    ref: row.ref || "",
    name: row.name || "",
    client: row.client_name || "",
    clientUserId: row.client_user_id || null,
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    town: row.town || "",
    county: row.county || "",
    postcode: row.postcode || "",
    projectType: row.project_type || "Residential",
    services: row.services || {},
    goals: row.goals || "",
    survey: nonEmpty(row.survey, EMPTY_SURVEY),
    pricing: nonEmpty(row.pricing, EMPTY_PRICING),
    designVisuals: {
      plans2d: visuals.filter((v) => v.kind === "plans2d").map(mapVisual),
      renders3d: visuals.filter((v) => v.kind === "renders3d").map(mapVisual),
    },
    proposal: nonEmpty(row.proposal, EMPTY_PROPOSAL),
    signature: nonEmpty(row.signature, EMPTY_SIGNATURE),
    status: row.status,
    previousStatus: row.previous_status || null,
    timeline: nonEmpty(row.timeline, EMPTY_TIMELINE),
    updates: (children.siteUpdates || []).map(mapSiteUpdate),
    variations: (children.variations || []).map(mapVariation),
    review: row.review_rating ? { rating: row.review_rating, text: row.review_text || "", submittedAt: row.review_submitted_at } : null,
    referrals: (children.referrals || []).map(mapReferral),
    referralCode: row.referral_code || null,
    referredByProjectId: row.referred_by_project_id || null,
    referralEntryId: row.referral_entry_id || null,
    messages: (children.messages || []).map(mapMessage),
    payments: row.payments || {},
    portalWelcomed: !!row.portal_welcomed,
    supportTickets: (children.supportTickets || []).map(mapTicket),
    assignedTeam: children.assignedTeam || [],
    createdAt: row.created_at,
    lostReason: row.lost_reason || null,
    lostNotes: row.lost_notes || null,
    lostAt: row.lost_at || null,
  };
}

// UI project -> the columns that live directly on the `projects` row.
// Child-table data (messages, variations, updates, tickets, referrals,
// visuals, assignedTeam) is written separately, one table operation per
// mutation — see the functions below.
function projectCoreColumnsFromUi(p) {
  return {
    id: p.id,
    ref: p.ref || null,
    name: p.name || "",
    client_name: p.client || "",
    // client_user_id is deliberately NOT included here. Nothing in the UI
    // sets `clientUserId` on a project (there's no "link client" screen
    // yet — see README), so if this were included every save would send
    // client_user_id: null and silently unlink an account a staff member
    // set directly via SQL. Omitting the key from an upsert leaves the
    // existing column value untouched instead of overwriting it.
    email: p.email || null,
    phone: p.phone || null,
    address: p.address || null,
    town: p.town || null,
    county: p.county || null,
    postcode: p.postcode || null,
    project_type: p.projectType || "Residential",
    services: p.services || {},
    goals: p.goals || null,
    survey: p.survey || {},
    pricing: p.pricing || {},
    proposal: p.proposal || {},
    signature: p.signature || {},
    status: p.status || "Draft",
    previous_status: p.previousStatus || null,
    timeline: p.timeline || {},
    payments: p.payments || {},
    portal_welcomed: !!p.portalWelcomed,
    referral_code: p.referralCode || null,
    referred_by_project_id: p.referredByProjectId || null,
    referral_entry_id: p.referralEntryId || null,
    lost_reason: p.lostReason || null,
    lost_notes: p.lostNotes || null,
    lost_at: p.lostAt || null,
    review_rating: p.review?.rating || null,
    review_text: p.review?.text || null,
    review_submitted_at: p.review?.submittedAt || null,
  };
}

function must(error) {
  if (error) throw error;
}

// ============================================================
// Reads
// ============================================================

// Loads every project plus all of its child records in one pass. Fine for
// a company this size (dozens–low hundreds of jobs); if that ever changes,
// the child-table fetches below are the place to add per-project lazy
// loading instead.
export async function fetchAllProjects() {
  const [projectsRes, teamRes, visualsRes, variationsRes, messagesRes, updatesRes, ticketsRes, referralsRes] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("project_team_members").select("project_id, team_member_id"),
    supabase.from("project_visuals").select("*").order("position", { ascending: true }),
    supabase.from("project_variations").select("*").order("created_at", { ascending: false }),
    supabase.from("project_messages").select("*").order("created_at", { ascending: true }),
    supabase.from("project_site_updates").select("*").order("created_at", { ascending: false }),
    supabase.from("project_support_tickets").select("*").order("created_at", { ascending: false }),
    supabase.from("project_referrals").select("*").order("created_at", { ascending: false }),
  ]);
  for (const res of [projectsRes, teamRes, visualsRes, variationsRes, messagesRes, updatesRes, ticketsRes, referralsRes]) must(res.error);

  const teamByProject = groupBy(teamRes.data, "project_id");
  const visualsByProject = groupBy(visualsRes.data, "project_id");
  const variationsByProject = groupBy(variationsRes.data, "project_id");
  const messagesByProject = groupBy(messagesRes.data, "project_id");
  const updatesByProject = groupBy(updatesRes.data, "project_id");
  const ticketsByProject = groupBy(ticketsRes.data, "project_id");
  const referralsByProject = groupBy(referralsRes.data, "project_id");

  return projectsRes.data.map((row) =>
    mapProjectFromDb(row, {
      assignedTeam: (teamByProject.get(row.id) || []).map((t) => t.team_member_id),
      visuals: visualsByProject.get(row.id) || [],
      variations: variationsByProject.get(row.id) || [],
      messages: messagesByProject.get(row.id) || [],
      siteUpdates: updatesByProject.get(row.id) || [],
      supportTickets: ticketsByProject.get(row.id) || [],
      referrals: referralsByProject.get(row.id) || [],
    })
  );
}

// ============================================================
// Core project row — the single checkpoint every "save the draft" action
// in NorthstoneSystem.jsx goes through (matches the app's existing
// syncDraft() checkpoints; child-table data is never part of this call).
// ============================================================
export async function saveProjectCore(uiProject, { createdBy } = {}) {
  const payload = projectCoreColumnsFromUi(uiProject);
  if (createdBy) payload.created_by = createdBy;
  const { error } = await supabase.from("projects").upsert(payload);
  must(error);
}

export async function deleteProject(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  must(error);
}

// ============================================================
// Assigned team (many-to-many)
// ============================================================
export async function addProjectTeamMember(projectId, teamMemberId) {
  const { error } = await supabase.from("project_team_members").insert({ project_id: projectId, team_member_id: teamMemberId });
  must(error);
}
export async function removeProjectTeamMember(projectId, teamMemberId) {
  const { error } = await supabase.from("project_team_members").delete().match({ project_id: projectId, team_member_id: teamMemberId });
  must(error);
}

// ============================================================
// Messages
// ============================================================
export async function insertMessageStaff(projectId, body, authorId) {
  const { data, error } = await supabase
    .from("project_messages")
    .insert({ project_id: projectId, sender: "team", author_id: authorId, body })
    .select()
    .single();
  must(error);
  return mapMessage(data);
}
export async function sendMessageAsClient(projectId, body) {
  const { data, error } = await supabase.rpc("submit_client_message", { p_project_id: projectId, p_body: body });
  must(error);
  return mapMessage(data);
}

// ============================================================
// Support tickets
// ============================================================
export async function resolveSupportTicket(ticketId) {
  const { error } = await supabase
    .from("project_support_tickets")
    .update({ status: "Resolved", resolved_at: new Date().toISOString() })
    .eq("id", ticketId);
  must(error);
}
export async function insertSupportTicketStaff(projectId, subject, description) {
  const { data, error } = await supabase
    .from("project_support_tickets")
    .insert({ project_id: projectId, subject, description })
    .select()
    .single();
  must(error);
  return mapTicket(data);
}
export async function submitSupportTicketAsClient(projectId, subject, description) {
  const { data, error } = await supabase.rpc("submit_support_ticket", { p_project_id: projectId, p_subject: subject, p_description: description });
  must(error);
  return mapTicket(data);
}

// ============================================================
// Variations (change orders)
// ============================================================
export async function insertVariation(projectId, { title, description, amount }) {
  const { data, error } = await supabase
    .from("project_variations")
    .insert({ project_id: projectId, title, description, amount })
    .select()
    .single();
  must(error);
  return mapVariation(data);
}
export async function deleteVariation(id) {
  const { error } = await supabase.from("project_variations").delete().eq("id", id);
  must(error);
}
export async function respondToVariationStaff(id, status) {
  const { error } = await supabase.from("project_variations").update({ status, responded_at: new Date().toISOString() }).eq("id", id);
  must(error);
}
export async function respondToVariationAsClient(id, status) {
  const { data, error } = await supabase.rpc("respond_to_variation", { p_variation_id: id, p_status: status });
  must(error);
  return mapVariation(data);
}

// ============================================================
// Site updates (construction progress feed)
// ============================================================
export async function insertSiteUpdate(projectId, { stage, caption, path }, createdBy) {
  const { data, error } = await supabase
    .from("project_site_updates")
    .insert({ project_id: projectId, stage, caption, storage_path: path, created_by: createdBy })
    .select()
    .single();
  must(error);
  return mapSiteUpdate(data);
}
export async function deleteSiteUpdate(id, path) {
  const { error } = await supabase.from("project_site_updates").delete().eq("id", id);
  must(error);
  if (path) await deletePhoto(PROJECT_PHOTOS_BUCKET, path);
}

// ============================================================
// Design visuals (2D plans / 3D renders)
// ============================================================
export async function insertVisual(projectId, kind, path, position = 0) {
  const { data, error } = await supabase
    .from("project_visuals")
    .insert({ project_id: projectId, kind, storage_path: path, position })
    .select()
    .single();
  must(error);
  return mapVisual(data);
}
export async function updateVisualCaption(id, caption) {
  const { error } = await supabase.from("project_visuals").update({ caption }).eq("id", id);
  must(error);
}
export async function deleteVisual(id, path) {
  const { error } = await supabase.from("project_visuals").delete().eq("id", id);
  must(error);
  if (path) await deletePhoto(PROJECT_PHOTOS_BUCKET, path);
}

// ============================================================
// Referrals
// ============================================================
export async function insertReferralStaff(projectId, { name, phone, email, notes }, referrerClientName) {
  const { data: referral, error } = await supabase
    .from("project_referrals")
    .insert({ project_id: projectId, name, phone, email, notes })
    .select()
    .single();
  must(error);

  const leadNotes = `Referred by ${referrerClientName || "a client"}${notes ? " — " + notes : ""}`;
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({ name, phone, email, source: "Referral", notes: leadNotes, referred_by_project_id: projectId, referral_id: referral.id })
    .select()
    .single();
  must(leadError);

  await supabase.from("project_referrals").update({ lead_id: lead.id }).eq("id", referral.id);
  return {
    referral: mapReferral({ ...referral, lead_id: lead.id }),
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone || "",
      email: lead.email || "",
      source: lead.source,
      notes: lead.notes || "",
      status: lead.status,
      createdAt: lead.created_at,
      referredByProjectId: lead.referred_by_project_id || null,
      referralEntryId: lead.referral_id || null,
    },
  };
}
export async function submitReferralAsClient(projectId, { name, phone, email, notes }) {
  const { data, error } = await supabase.rpc("submit_referral", { p_project_id: projectId, p_name: name, p_phone: phone, p_email: email, p_notes: notes });
  must(error);
  return mapReferral(data);
}
// Used when a referred project gets signed (staff-only action — see
// signProposal in NorthstoneSystem.jsx) to credit the referrer.
export async function rewardReferral(referralEntryId, rewardAmount) {
  const { error } = await supabase
    .from("project_referrals")
    .update({ status: "Rewarded", reward_amount: rewardAmount, rewarded_at: new Date().toISOString().slice(0, 10) })
    .eq("id", referralEntryId);
  must(error);
}

// ============================================================
// Review, portal welcome, proposal signing — core-column actions with a
// staff/client split because both a real client and a staff member
// previewing the portal can reach the same UI action.
// ============================================================
export async function submitReviewAsClient(projectId, rating, text) {
  const { error } = await supabase.rpc("submit_review", { p_project_id: projectId, p_rating: rating, p_text: text });
  must(error);
}
export async function dismissPortalWelcomeAsClient(projectId) {
  const { error } = await supabase.rpc("dismiss_portal_welcome", { p_project_id: projectId });
  must(error);
}

// ============================================================
// Client invite — staff-only, calls the invite-client Edge Function since
// creating/inviting an auth user needs the service-role key. See
// supabase/functions/invite-client.
// ============================================================
export async function inviteClient(projectId, email, fullName) {
  const { data, error } = await supabase.functions.invoke("invite-client", {
    body: { projectId, email, fullName },
  });
  if (error) {
    // Edge Function errors land here with the response body on error.context
    let message = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch {
      // response body wasn't JSON — fall back to error.message
    }
    throw new Error(message);
  }
  return data;
}
