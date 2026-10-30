// Triage a support ticket via Lovable AI (Gemini 2.5 Flash).
// - Loads ticket + user profile + recent runtime errors
// - Returns structured JSON: category, severity, root_cause, eta_hours,
//   suggested_reply (in user's language), linked_incident_id (best match)
// - Writes back to support_tickets and sends two emails:
//     1) Customer: AI analysis + ETA + first reply
//     2) REDACTED_ACCOUNT_EMAIL: full triage with user context
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/email-send.ts";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const SUPPORT_INBOX = "info@useadtool.ai";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function esc(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function etaLabel(hours: number, lang: string): string {
  const map: Record<string, (h: number) => string> = {
    de: (h) => h <= 2 ? "wenige Stunden" : h <= 24 ? "24 Stunden" : h <= 72 ? "2–3 Tagen" : "einer Woche",
    es: (h) => h <= 2 ? "pocas horas" : h <= 24 ? "24 horas" : h <= 72 ? "2–3 días" : "una semana",
    en: (h) => h <= 2 ? "a few hours" : h <= 24 ? "24 hours" : h <= 72 ? "2–3 days" : "one week",
  };
  return (map[lang] ?? map.en)(hours);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "triage-support-ticket" });

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticket_id)
      .maybeSingle();

    if (tErr || !ticket) throw new Error(`ticket not found: ${tErr?.message ?? ""}`);

    // Load user profile (best effort)
    let profile: Record<string, unknown> | null = null;
    if (ticket.user_id && ticket.user_id !== "00000000-0000-0000-0000-000000000000") {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, email, full_name, plan_code, credits_balance, created_at")
        .eq("id", ticket.user_id)
        .maybeSingle();
      profile = p;
    }

    // Open incidents to match against
    const { data: incidents } = await supabase
      .from("status_incidents")
      .select("id, title, body, severity, status, created_at")
      .in("status", ["investigating", "identified", "monitoring"])
      .order("created_at", { ascending: false })
      .limit(10);

    // === Call Lovable AI for triage ===
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const attachmentsList = Array.isArray((ticket as Record<string, unknown>).attachments)
      ? ((ticket as Record<string, unknown>).attachments as Array<{ type?: string; name?: string }>)
      : [];
    const visualEvidence = attachmentsList.filter((a) =>
      (a.type || "").startsWith("image/") || (a.type || "").startsWith("video/")
    );
    const hasVisualEvidence = visualEvidence.length > 0;

    const userPrompt = `Triage this support ticket. Reply in the same language as the customer.

CUSTOMER TICKET:
Subject: ${ticket.subject}
Category: ${ticket.category}
Severity: ${ticket.severity ?? "normal"}
Module: ${ticket.affected_module ?? "—"}
Description: ${ticket.description ?? ""}
Expected: ${ticket.expected_result ?? ""}
Actual: ${ticket.actual_result ?? ""}
Repro: ${ticket.reproduction_steps ?? ""}
Visual evidence attached: ${hasVisualEvidence ? `YES (${visualEvidence.length} file(s)) — assume ~60% faster reproduction time, so reduce ETA accordingly.` : "NO — without visual we may need a clarifying question first."}

USER PROFILE:
${profile ? JSON.stringify(profile) : "Anonymous"}

CURRENTLY KNOWN OPEN INCIDENTS:
${(incidents ?? []).map((i) => `- [${i.id}] (${i.severity}) ${i.title}: ${i.body?.slice(0, 200)}`).join("\n") || "None"}

Return strict JSON via the tool call.`;


    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert support triage AI for AdTool AI (a video creation platform). Be concise, empathetic, and concrete. Never invent facts." },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_triage",
            description: "Submit structured triage analysis",
            parameters: {
              type: "object",
              required: ["category", "severity", "root_cause", "eta_hours", "suggested_reply", "language", "confidence"],
              properties: {
                category: { type: "string", enum: ["bug", "billing", "howto", "feature", "account", "other"] },
                severity: { type: "string", enum: ["low", "normal", "high", "blocking"] },
                root_cause: { type: "string", description: "One-paragraph hypothesis of what caused this" },
                eta_hours: { type: "integer", description: "Realistic ETA in hours: 2 / 24 / 72 / 168" },
                suggested_reply: { type: "string", description: "Polished customer-facing reply in the customer's language (DE/EN/ES). 3-6 sentences. Empathetic + concrete next step + ETA mention." },
                language: { type: "string", enum: ["de", "en", "es"] },
                confidence: { type: "number", description: "0..1 confidence in triage accuracy" },
                linked_incident_id: { type: ["string", "null"], description: "UUID of best-matching open incident, or null" },
              },
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_triage" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${txt.slice(0, 300)}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("no tool call in AI response");
    const triage = JSON.parse(toolCall.function.arguments);


    // Apply visual-evidence boost: shrink ETA by 40% when image/video attached
    if (hasVisualEvidence && typeof triage.eta_hours === "number") {
      triage.eta_hours = Math.max(1, Math.round(triage.eta_hours * 0.6));
    }

    // === Write back ===
    await supabase.from("support_tickets").update({
      ai_category: triage.category,
      ai_severity: triage.severity,
      ai_root_cause: triage.root_cause,
      ai_eta_hours: triage.eta_hours,
      ai_suggested_reply: triage.suggested_reply,
      ai_language: triage.language,
      ai_confidence: triage.confidence,
      ai_analyzed_at: new Date().toISOString(),
      linked_incident_id: triage.linked_incident_id || null,
    }).eq("id", ticket_id);


    // === Email customer with AI analysis ===
    const customerEmail = ticket.contact_email;
    const customerName = ticket.contact_name ?? "there";
    const lang = triage.language || "en";
    const eta = etaLabel(triage.eta_hours, lang);

    const subjectByLang: Record<string, string> = {
      de: `Ihre Anfrage wurde analysiert — ETA ~${eta}`,
      es: `Tu solicitud fue analizada — ETA ~${eta}`,
      en: `Your request has been analysed — ETA ~${eta}`,
    };

    if (customerEmail) {
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;color:#111">
<div style="max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#050816,#1a1a2e);color:#F5C76A;padding:28px;border-radius:10px 10px 0 0;text-align:center">
    <h1 style="margin:0;font-family:Georgia,serif">AdTool AI</h1>
    <p style="margin:6px 0 0;color:#fff;opacity:.85">${esc(subjectByLang[lang] ?? subjectByLang.en)}</p>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-radius:0 0 10px 10px">
    <p>Hi ${esc(customerName)},</p>
    <p style="white-space:pre-wrap">${esc(triage.suggested_reply)}</p>
    <div style="background:#f9fafb;border-left:4px solid #F5C76A;padding:14px 16px;margin:18px 0;border-radius:6px;font-size:14px">
      <strong>${lang === "de" ? "Voraussichtliche Lösung" : lang === "es" ? "Resolución estimada" : "Estimated resolution"}:</strong> ~${eta}<br/>
      <strong>Ticket:</strong> #${ticket.id.slice(0, 8)}
    </div>
    <p style="color:#6b7280;font-size:13px">— ${lang === "de" ? "Dein AdTool AI Team" : lang === "es" ? "Tu equipo de AdTool AI" : "Your AdTool AI team"}</p>
  </div>
</div></body></html>`;
      await sendEmail({
        to: customerEmail,
        subject: subjectByLang[lang] ?? subjectByLang.en,
        html,
        template: "support_ticket_triaged",
        category: "transactional",
      });
    }

    // === Email internal inbox with full triage ===
    const internalHtml = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f9fafb;padding:20px">
<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
  <div style="background:#050816;color:#F5C76A;padding:20px">
    <div style="font-size:12px;opacity:.8">AI TRIAGE · confidence ${(triage.confidence * 100).toFixed(0)}%</div>
    <h2 style="margin:6px 0 0;color:#fff">[${triage.severity.toUpperCase()}] ${esc(ticket.subject)}</h2>
  </div>
  <div style="padding:20px">
    <p><strong>Customer:</strong> ${esc(customerName)} &lt;${esc(customerEmail ?? "—")}&gt;</p>
    ${profile ? `<p><strong>Plan:</strong> ${esc(String((profile as any).plan_code ?? "—"))} · <strong>Credits:</strong> ${esc(String((profile as any).credits_balance ?? "—"))}</p>` : ""}
    <hr/>
    <h3 style="color:#050816">Root cause hypothesis</h3>
    <p style="background:#f9fafb;padding:12px;border-radius:6px;white-space:pre-wrap">${esc(triage.root_cause)}</p>
    <h3 style="color:#050816">Suggested reply (${lang.toUpperCase()})</h3>
    <p style="background:#fef3c7;padding:12px;border-radius:6px;white-space:pre-wrap;border-left:4px solid #F5C76A">${esc(triage.suggested_reply)}</p>
    <h3 style="color:#050816">ETA</h3>
    <p>${triage.eta_hours}h (~${eta})</p>
    ${triage.linked_incident_id ? `<p>🔗 <strong>Linked incident:</strong> ${esc(triage.linked_incident_id)}</p>` : ""}
    <hr/>
    <details><summary style="cursor:pointer;color:#6b7280">Original ticket payload</summary>
      <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:11px;overflow:auto">${esc(JSON.stringify({
        category: ticket.category, severity: ticket.severity, module: ticket.affected_module,
        description: ticket.description, expected: ticket.expected_result, actual: ticket.actual_result, repro: ticket.reproduction_steps,
      }, null, 2))}</pre></details>
    <p style="margin-top:18px;color:#6b7280;font-size:12px">Ticket #${ticket.id} · open in cockpit: ${Deno.env.get("APP_URL") ?? "https://useadtool.ai"}/admin/qa-cockpit</p>
  </div>
</div></body></html>`;

    await sendEmail({
      to: SUPPORT_INBOX,
      subject: `[AI-TRIAGE · ${triage.severity.toUpperCase()}] ${ticket.subject} — ETA ${triage.eta_hours}h`,
      html: internalHtml,
      template: "support_ticket_triage_internal",
      category: "transactional",
      replyTo: customerEmail ?? undefined,
    });

    return new Response(JSON.stringify({ ok: true, triage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("triage-support-ticket error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
