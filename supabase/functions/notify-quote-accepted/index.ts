// Emails the Northstone admin inbox when a client accepts & signs their
// quote from the portal. The signing itself (recording the typed name,
// timestamp, and flipping status to "Signed") already happened server-side
// via the sign_project_proposal() RPC — see supabase/migrations. This
// function only fires the notification afterwards, and independently
// re-checks that the project really is signed and belongs to the caller
// rather than trusting the client to only call it after a real acceptance.
//
// Runs with the service-role key (to read the project row regardless of
// RLS) and a Resend API key (to send the email) — both secrets, so this
// has to be an Edge Function rather than a direct browser call.
//
// Deploy: supabase functions deploy notify-quote-accepted
// Then:   supabase secrets set RESEND_API_KEY=re_your_key_here
// Optional overrides (sensible defaults below if unset):
//   supabase secrets set QUOTE_ACCEPTED_NOTIFY_EMAIL=you@yourcompany.com
//   supabase secrets set RESEND_FROM_EMAIL="Northstone <notifications@yourdomain.com>"

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(str: string) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
  ));
}

const DEFAULT_NOTIFY_EMAIL = "info@northstonedesignandbuild.com";
// Resend's shared sandbox sender — works with no domain setup, but Resend
// only actually delivers it to the account's own verified address until a
// sending domain is verified. Set RESEND_FROM_EMAIL once that's done.
const DEFAULT_FROM_EMAIL = "Northstone Design & Build <onboarding@resend.dev>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server misconfigured: missing Supabase environment variables" }, 500);
    }
    if (!resendApiKey) {
      return json({ error: "Server misconfigured: RESEND_API_KEY not set" }, 500);
    }

    // Identify the caller using their own token — never trust a client-sent user id.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { projectId } = body || {};
    if (!projectId) {
      return json({ error: "projectId is required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("id, ref, name, client_user_id, status, signature")
      .eq("id", projectId)
      .single();
    if (projectError || !project) {
      return json({ error: "Project not found" }, 404);
    }

    // Only notify for the caller's own project, and only once it's actually
    // signed — re-checked here rather than trusted from the request body.
    if (project.client_user_id !== user.id) {
      return json({ error: "Not authorized for this project" }, 403);
    }
    if (project.status !== "Signed" || !project.signature?.signed) {
      return json({ error: "This quote hasn't been accepted yet" }, 400);
    }

    const notifyTo = Deno.env.get("QUOTE_ACCEPTED_NOTIFY_EMAIL") || DEFAULT_NOTIFY_EMAIL;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || DEFAULT_FROM_EMAIL;
    const clientName = project.signature?.clientName || "A client";
    const acceptedDate = project.signature?.date || new Date().toISOString().slice(0, 10);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [notifyTo],
        subject: `Quote accepted — ${project.name || project.ref || "project"}`,
        html: `
          <p><strong>${escapeHtml(clientName)}</strong> has accepted their quote.</p>
          <ul>
            <li><strong>Project:</strong> ${escapeHtml(project.name || "")}</li>
            <li><strong>Reference:</strong> ${escapeHtml(project.ref || "")}</li>
            <li><strong>Accepted on:</strong> ${escapeHtml(acceptedDate)}</li>
          </ul>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      return json({ error: `Email provider error: ${errText || emailRes.status}` }, 502);
    }

    return json({ sent: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected server error" }, 500);
  }
});
