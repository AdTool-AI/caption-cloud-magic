import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { motionStudioGateForUser } from "../_shared/motion-studio-premium.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const COST_PER_CLIP = 5;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "audio" });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);
    const user = await resolveRequestUser(req, supabase);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    // Motion Studio premium gate — subscription or Creator account required
    // before any generation, render or edit. Existing work stays untouched.
    {
      const denied = await motionStudioGateForUser(user.id, corsHeaders);
      if (denied) return denied;
    }

    const body = await req.json();
    const {
      prompt,
      duration = 6,
      kind = 'sfx',
      project_id = null,
      scene_id = null,
      start_offset = 0,
      volume = 0.5,
      ducking_enabled = false,
      prompt_influence = 0.4,
    } = body || {};

    if (!prompt || typeof prompt !== 'string') return json({ error: 'prompt required' }, 400);
    if (!['ambient','sfx','foley'].includes(kind)) return json({ error: 'invalid kind' }, 400);
    const dur = Math.max(0.5, Math.min(22, Number(duration) || 6));

    // Wallet check
    const { data: wallet } = await supabase
      .from('wallets').select('balance').eq('user_id', user.id).single();
    if (!wallet || wallet.balance < COST_PER_CLIP) {
      return json({ error: 'INSUFFICIENT_CREDITS', required: COST_PER_CLIP }, 402);
    }

    const ELEVEN = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVEN) return json({ error: 'ELEVENLABS_API_KEY missing' }, 500);

    // Deduct credits up front (will refund on failure)
    await supabase.from('wallets').update({
      balance: wallet.balance - COST_PER_CLIP,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);

    const refund = async (reason: string) => {
      console.warn(`[generate-scene-sfx] Refunding ${COST_PER_CLIP} credits: ${reason}`);
      const { data: w2 } = await supabase
        .from('wallets').select('balance').eq('user_id', user.id).single();
      if (w2) {
        await supabase.from('wallets').update({
          balance: w2.balance + COST_PER_CLIP,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
      }
    };

    let audioBuffer: ArrayBuffer;
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt, duration_seconds: dur, prompt_influence }),
      });
      if (!res.ok) {
        const txt = await res.text();
        await refund(`ElevenLabs ${res.status}: ${txt.slice(0, 200)}`);
        return json({ error: 'sfx generation failed', detail: txt }, 502);
      }
      audioBuffer = await res.arrayBuffer();
    } catch (e) {
      await refund(`fetch error: ${(e as Error).message}`);
      return json({ error: 'sfx generation error' }, 500);
    }

    const path = `${user.id}/${kind}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.mp3`;
    const { error: upErr } = await supabase.storage
      .from('scene-sfx')
      .upload(path, new Uint8Array(audioBuffer), { contentType: 'audio/mpeg', upsert: false });
    if (upErr) {
      await refund(`upload error: ${upErr.message}`);
      return json({ error: 'upload failed', detail: upErr.message }, 500);
    }

    const { data: pub } = supabase.storage.from('scene-sfx').getPublicUrl(path);

    const { data: clip, error: insErr } = await supabase
      .from('scene_audio_clips')
      .insert({
        user_id: user.id,
        project_id,
        scene_id,
        kind,
        source: 'ai',
        prompt,
        url: pub.publicUrl,
        storage_path: path,
        start_offset,
        duration: dur,
        volume,
        ducking_enabled,
        cost_credits: COST_PER_CLIP,
      })
      .select()
      .single();

    if (insErr) {
      console.error('[generate-scene-sfx] insert error', insErr);
      // Don't refund here — the audio was generated and stored successfully.
    }

    return json({ success: true, clip, url: pub.publicUrl, credits_used: COST_PER_CLIP });
  } catch (e) {
    console.error('[generate-scene-sfx] fatal', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
