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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("APP_URL");
  // SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY are auto-injected by the Supabase
  // Edge Functions runtime — this should never actually trip, it's here so
  // TypeScript can narrow the types below rather than complaining they
  // might be undefined.
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured: missing Supabase environment variables" }), { status: 500 });
  }

  // Identify the caller using their own token — never trust a client-sent user id.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  // Privileged client — only used after we've confirmed the caller is staff.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfileError || callerProfile?.role !== "staff") {
    return new Response(JSON.stringify({ error: "Staff only" }), { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  const { projectId, email, fullName } = body || {};
  if (!projectId || !email) {
    return new Response(JSON.stringify({ error: "projectId and email are required" }), { status: 400 });
  }

  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (projectError || !project) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });
  }

  // If this email already has an account (e.g. they self-signed-up already,
  // or were invited to a previous project), just link it — don't re-invite.
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
      return new Response(JSON.stringify({ error: linkError.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ linked: true, invited: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { role: "client", full_name: fullName || null },
    redirectTo: appUrl,
  });
  if (inviteError) {
    return new Response(JSON.stringify({ error: inviteError.message }), { status: 400 });
  }

  const { error: linkError } = await adminClient
    .from("projects")
    .update({ client_user_id: invited.user.id })
    .eq("id", projectId);
  if (linkError) {
    return new Response(JSON.stringify({ error: linkError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ linked: true, invited: true, userId: invited.user.id }), {
    headers: { "Content-Type": "application/json" },
  });
});
