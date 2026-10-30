import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { getPremiumVoiceById, getDefaultSettingsForVoice, getDefaultModelForVoice } from "../_shared/premium-voices.ts";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { withTtsLanguage } from "../_shared/tts-language.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface VoiceoverRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
  /** ISO-639-1 target language — pins ElevenLabs to that language. */
  language?: string;
  projectId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "audio" });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenlabsApiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const user = await resolveRequestUser(req, supabase);
    if (!user) throw new Error('Unauthorized');

    const requestBody: VoiceoverRequest = await req.json();

    let validatedSpeed = requestBody.speed || 1.0;
    if (validatedSpeed < 0.7 || validatedSpeed > 1.2) {
      validatedSpeed = Math.max(0.7, Math.min(1.2, validatedSpeed));
    }

    const {
      text,
      voiceId = '9BWtsMINqrJLrRacOk9x',
      projectId,
    } = requestBody;
    const speed = validatedSpeed;

    // Pull premium defaults if known
    const premium = getPremiumVoiceById(voiceId);
    const defaultSettings = getDefaultSettingsForVoice(voiceId);
    const modelId = requestBody.modelId || getDefaultModelForVoice(voiceId);

    const stability = requestBody.stability ?? defaultSettings.stability;
    const similarityBoost = requestBody.similarityBoost ?? defaultSettings.similarity_boost;
    const style = requestBody.style ?? defaultSettings.style;
    const useSpeakerBoost = requestBody.useSpeakerBoost ?? defaultSettings.use_speaker_boost;

    console.log('Generating voiceover:', {
      textLength: text.length, voiceId, premium: !!premium, modelId,
      speed, stability, similarityBoost, style, useSpeakerBoost, projectId,
    });

    const DEFAULT_FALLBACK_VOICE_ID = '9BWtsMINqrJLrRacOk9x'; // Aria — universal default
    const ttsPayload = withTtsLanguage({
      text,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: useSpeakerBoost,
        speed,
      },
    }, requestBody.language, modelId);

    const callElevenLabs = async (vid: string) => {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128&optimize_streaming_latency=2`;
      return fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenlabsApiKey,
        },
        body: JSON.stringify(ttsPayload),
      });
    };

    let effectiveVoiceId = voiceId;
    let elevenlabsResponse = await callElevenLabs(voiceId);

    // Fallback: if voice not found (404) or invalid (422), retry with a known-good default
    if (!elevenlabsResponse.ok && (elevenlabsResponse.status === 404 || elevenlabsResponse.status === 422) && voiceId !== DEFAULT_FALLBACK_VOICE_ID) {
      const errorText = await elevenlabsResponse.text().catch(() => '');
      console.warn(`ElevenLabs voice ${voiceId} failed (${elevenlabsResponse.status}): ${errorText}. Falling back to ${DEFAULT_FALLBACK_VOICE_ID}.`);
      effectiveVoiceId = DEFAULT_FALLBACK_VOICE_ID;
      elevenlabsResponse = await callElevenLabs(DEFAULT_FALLBACK_VOICE_ID);
    }

    if (!elevenlabsResponse.ok) {
      const errorText = await elevenlabsResponse.text();
      console.error('ElevenLabs API error:', elevenlabsResponse.status, errorText);
      throw new Error(`ElevenLabs API error: ${elevenlabsResponse.status}`);
    }

    const audioBlob = await elevenlabsResponse.blob();
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioUint8Array = new Uint8Array(audioBuffer);

    // ✅ Unique path per generation — prevents Supabase CDN AND Lambda worker
    // caches from serving stale audio across parallel chunk renders.
    // Previously `${projectId}_voiceover.mp3` with upsert=true overwrote the
    // same file → different Lambda workers occasionally fetched mixed versions
    // (old vs new), causing "repetitions" and "cuts" at chunk boundaries.
    const fileName = `${projectId}_${Date.now()}_voiceover.mp3`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('voiceover-audio')
      .upload(filePath, audioUint8Array, { contentType: 'audio/mpeg', upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('voiceover-audio').getPublicUrl(filePath);
    // Clean URL — no `?v=` query string. Path itself is unique, query strings
    // can confuse some CDN fetchers / Lambda video-fetcher.
    const cacheBustedUrl = urlData.publicUrl;

    // Fire-and-forget cleanup of older VO files for the same projectId
    // (keeps storage tidy without blocking the response).
    try {
      const prefix = `${user.id}/`;
      const { data: listing } = await supabase.storage
        .from('voiceover-audio')
        .list(user.id, { limit: 100, search: `${projectId}_` });
      if (listing && listing.length > 1) {
        const toDelete = listing
          .filter(f => f.name.startsWith(`${projectId}_`) && f.name !== fileName)
          .map(f => `${prefix}${f.name}`);
        if (toDelete.length > 0) {
          await supabase.storage.from('voiceover-audio').remove(toDelete);
          console.log('[generate-voiceover] cleaned old VO files:', toDelete.length);
        }
      }
    } catch (cleanupErr) {
      console.warn('[generate-voiceover] cleanup skipped:', cleanupErr);
    }

    // Bit-exact duration from MP3 file size (CBR @ 128 kbps).
    // Replaces the old 150-WPM heuristic which mis-estimated VO length
    // (especially at speed != 1.0), causing audio cut-offs and "repetitions"
    // when the composition length didn't match the real audio length.
    const BITRATE_BPS = 128 * 1000;
    const realDurationSeconds = (audioUint8Array.byteLength * 8) / BITRATE_BPS;
    const estimatedDuration = Math.round(realDurationSeconds * 100) / 100;
    console.log('[generate-voiceover] real duration (from bytes):', realDurationSeconds.toFixed(3), 's', '| bytes:', audioUint8Array.byteLength);

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: cacheBustedUrl,
        duration: estimatedDuration,
        voiceId: effectiveVoiceId,
        modelId,
        voiceUsed: (effectiveVoiceId !== voiceId) ? 'Aria (fallback)' : (premium?.name || voiceId),
        fallbackUsed: effectiveVoiceId !== voiceId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating voiceover:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
