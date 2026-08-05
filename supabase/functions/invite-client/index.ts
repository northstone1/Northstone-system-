// Invites a client to their project portal: creates their Supabase Auth
// account (or reuses one if they already self-signed-up), emails them a
// secure "set your password" link via Supabase's built-in Auth email
// service, and links the resulting account to the project.
//
// Runs with the service-role key, which is why this has to be an Edge
// Function rather than a direct browser call — inviteUserByEmail() is a
// privileged admin operation. Staff-only, enforced below by checking the
// caller's own profile before doing anything.
//
// Deploy: supabase functions deploy invite-client
// Then set the redirect target once: supabase secrets set APP_URL=https://your-deployed-app-url

import { createClient } from "npm:@supabase/supabase-js@2";

// Supabase Edge Functions do NOT add CORS headers on their own — every
// response, including the OPTIONS preflight AND every success/error path
// below, has to set these explicitly or the browser silently discards the
// response (and, depending on the failure mode, may never send the real
// request at all).
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

Deno.serve(async (req) => {
  // Preflight — the browser sends this before the real POST because the
  // request carries an Authorization header and a JSON body. Must return
  // 200/204 with the CORS headers above, nothing else, or the browser
  // never sends the actual POST at all.
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
    const appUrl = Deno.env.get("APP_URL");
    // SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY are auto-injected by the
    // Supabase Edge Functions runtime — this should never actually trip,
    // it's here so TypeScript can narrow the types below rather than
    // complaining they might be undefined.
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server misconfigured: missing Supabase environment variables" }, 500);
    }

    // Identify the caller using their own token — never trust a client-sent user id.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    // Privileged client — only used after we've confirmed the caller is staff.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (callerProfileError || callerProfile?.role !== "staff") {
      return json({ error: "Staff only" }, 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { projectId, email, fullName } = body || {};
    if (!projectId || !email) {
      return json({ error: "projectId and email are required" }, 400);
    }

    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .single();
    if (projectError || !project) {
      return json({ error: "Project not found" }, 404);
    }

    // If this email already has an account (e.g. they self-signed-up
    // already, or were invited to a previous project), just link it —
    // don't re-invite.
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { error: linkError } = await adminClient
        .from("projects")
        .update({ client_user_id: existingProfile.id })
        .eq("id", projectId);
      if (linkError) {
        return json({ error: linkError.message }, 500);
      }
      return json({ linked: true, invited: false });
    }

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { role: "client", full_name: fullName || null },
      redirectTo: appUrl,
    });
    if (inviteError) {
      return json({ error: inviteError.message }, 400);
    }

    const { error: linkError } = await adminClient
      .from("projects")
      .update({ client_user_id: invited.user.id })
      .eq("id", projectId);
    if (linkError) {
      return json({ error: linkError.message }, 500);
    }

    return json({ linked: true, invited: true, userId: invited.user.id });
  } catch (e) {
    // Belt and braces: any unexpected exception still gets a CORS-headed
    // response instead of Deno's default error page, which lacks CORS
    // headers entirely and would look exactly like this same "request
    // vanishes after preflight" symptom from the browser's side.
    return json({ error: e instanceof Error ? e.message : "Unexpected server error" }, 500);
  }
});
