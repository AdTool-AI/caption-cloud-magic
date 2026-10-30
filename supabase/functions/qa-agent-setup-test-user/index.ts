// QA Agent Setup Test User
// Idempotent: creates REDACTED_ACCOUNT_EMAIL (Enterprise plan), flags is_test_user,
// allocates the 300€ QA budget, returns the user id so secrets can be saved.
// Admin-only.

import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { tl, withLang } from "../_shared/i18n.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

Deno.serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "qa-agent-setup-test-user" });


  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Auth: require admin caller
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("auth required");
    const { data: caller } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!caller?.user) throw new Error("unauthenticated");
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: caller.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("admin only");

    const body = await req.json().catch(() => ({}));
    const email: string = body?.email ?? "qa-bot@useadtool.ai";
    const resetPassword: boolean = body?.reset_password === true;
    const password: string =
      body?.password ?? crypto.randomUUID().replace(/-/g, "") + "Q!9";

    // Check if user exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    let userId: string;
    let created = false;
    let passwordChanged = false;

    if (existingProfile) {
      userId = existingProfile.id;
      if (resetPassword) {
        const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
          password,
        });
        if (updErr) throw updErr;
        passwordChanged = true;
      }
    } else {
      // Create auth user
      const { data: authUser, error: authErr } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Bond QA Agent", qa_test_user: true },
        });
      if (authErr || !authUser?.user) throw authErr ?? new Error("create user failed");
      userId = authUser.user.id;
      created = true;
    }

    // Flag as test user + grant Enterprise plan + huge platform credits
    await supabase
      .from("profiles")
      .update({
        is_test_user: true,
        plan_code: "enterprise",
        full_name: "Bond QA Agent",
      })
      .eq("id", userId);

    // Initialize / top-up internal credits (separate from real-money budget)
    await supabase
      .from("user_credits")
      .upsert(
        { user_id: userId, balance: 999_000_000 },
        { onConflict: "user_id" }
      );

    // Grant admin role so smoke missions can reach admin-only routes (/admin/*).
    // Roles live in the dedicated user_roles table — never on profiles.
    const { error: roleErr } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "admin" },
        { onConflict: "user_id,role" }
      );
    if (roleErr) {
      console.warn("[qa-agent-setup-test-user] could not upsert admin role:", roleErr.message);
    }

    const passwordReturned = created || passwordChanged;
    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        email,
        password: passwordReturned ? password : null,
        created,
        password_changed: passwordChanged,
        instructions: passwordReturned
          ? tl({ de: "Speichere das Passwort SOFORT als Secret QA_TEST_USER_PASSWORD — es wird nur dieses eine Mal angezeigt.", en: "Save the password IMMEDIATELY as Secret QA_TEST_USER_PASSWORD — it will only be shown this one time.", es: "Guarda la contraseña INMEDIATAMENTE como Secreto QA_TEST_USER_PASSWORD — solo se mostrará esta vez." })
          : "User existierte bereits; Passwort unverändert. Sende { reset_password: true } um es neu zu setzen.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    console.error("[qa-agent-setup-test-user] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
})(req)));
