import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIZE_HINTS: Record<string, string> = {
  minimal: "wide 16:9 landscape banner composition, cinematic horizontal framing",
  split: "tall 3:4 portrait composition, vertical framing optimized for a side panel",
  landing: "ultra-wide 16:9 landscape hero composition, dramatic horizontal framing",
  square: "1:1 square composition, balanced centered framing",
  section: "wide 16:9 landscape composition, editorial framing for an in-page section",
};

async function callImageModel(prompt: string, styleSeedUrl?: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const userContent: any[] = [{ type: "text", text: prompt }];
  if (styleSeedUrl) {
    userContent.push({ type: "image_url", image_url: { url: styleSeedUrl } });
  }
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: styleSeedUrl ? userContent : prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limit exceeded, try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Please add credits.");
    const t = await resp.text();
    console.error("AI gateway error:", resp.status, t);
    throw new Error("AI gateway error");
  }
  const data = await resp.json();
  const dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
  if (!dataUrl) throw new Error("No image returned");
  return dataUrl;
}

async function processJob(opts: {
  supabase: any;
  adminSupabase?: any;
  userId: string;
  jobId?: string;
  prompt: string;
  template: string;
  count: number;
  eventId?: string;
  tag?: string;
  styleSeedUrl?: string;
}) {
  const writer = opts.adminSupabase ?? opts.supabase;
  const { userId, jobId, prompt, template, count, eventId, tag, styleSeedUrl } = opts;
  const updateJob = (fields: Record<string, unknown>) => {
    let query = writer.from("image_generation_jobs").update(fields).eq("id", jobId).eq("user_id", userId);
    if (eventId) query = query.eq("event_id", eventId);
    return query;
  };

  if (jobId) {
    await updateJob({ status: "running" });
  }

  try {
    const sizeHint = SIZE_HINTS[template] ?? SIZE_HINTS.minimal;
    const stylePart = styleSeedUrl
      ? "Match the photographic style, palette, mood, lighting, lens character, and grain of the reference image precisely. Stay strictly photo-realistic."
      : "STRICTLY PHOTO-REALISTIC. Unretouched documentary photograph captured on a full-frame DSLR or mirrorless camera (Canon R5 / Sony A7IV) with a 35mm or 50mm f/1.4 prime lens. Real people with believable, varied human faces, natural pores and skin texture, asymmetric features, real eyes (no extra fingers, no warped hands, no melted faces). Candid moment — genuine laughter, conversation, attention on a speaker — never posed staring at the camera. Diverse, real-world attendees. Natural ambient or warm tungsten venue lighting with realistic falloff, soft bokeh, gentle motion in the background, fine 35mm film-style grain. Looks like it was published in a magazine like Monocle, The New York Times, or It's Nice That. Absolutely NO: 3D renders, illustration, CGI look, plastic skin, glossy AI sheen, neon gradients, abstract shapes, geometric overlays, holograms, sci-fi UI, watermarks, text, logos, oversaturated colors, symmetrical AI compositions, or generic stock-photo staging.";
    const fullPrompt =
      `${prompt}\n\nDesign requirements: ${sizeHint}. ${stylePart} ` +
      `High quality event marketing imagery. Striking, modern, editorial. ` +
      `Leave subtle space for potential text overlay. No text, no watermarks, no logos in the image.`;

    const results = await Promise.allSettled(
      Array.from({ length: count }).map(() => callImageModel(fullPrompt, styleSeedUrl)),
    );

    const dataUrls = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    if (dataUrls.length === 0) {
      const firstErr = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      throw new Error(firstErr?.reason?.message || "No image generated");
    }

    const uploaded: { url: string; libraryId?: string }[] = [];
    for (const dataUrl of dataUrls) {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `ai/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;
      const { error: upErr } = await writer.storage
        .from("event-assets")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) {
        console.error("upload error", upErr);
        continue;
      }
      const { data: pub } = writer.storage.from("event-assets").getPublicUrl(path);
      let libraryId: string | undefined;
      if (eventId) {
        const { data: libRow, error: libErr } = await writer
          .from("event_image_library")
          .insert({ event_id: eventId, url: pub.publicUrl, prompt, source: "ai", tag: tag ?? null })
          .select("id")
          .single();
        if (libErr) {
          console.error("library insert error", libErr);
          throw new Error("Generated image could not be saved to the library");
        }
        libraryId = libRow?.id;
      }
      uploaded.push({ url: pub.publicUrl, libraryId });
    }

    if (jobId) {
      await updateJob({
        status: "succeeded",
        result_urls: uploaded,
      });
    }

    return uploaded;
  } catch (e: any) {
    console.error("processJob failed:", e);
    if (jobId) {
      await updateJob({
        status: "failed",
        error: e?.message || "Generation failed",
      });
    }
    throw e;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const prompt = (body?.prompt ?? "") as string;
    const template = (body?.template ?? "minimal") as string;
    const count = Math.max(1, Math.min(4, Number(body?.count ?? 1)));
    const styleSeedUrl = body?.style_seed_url as string | undefined;
    const eventId = body?.event_id as string | undefined;
    const tag = body?.tag as string | undefined;
    const jobId = body?.job_id as string | undefined;
    const background = body?.background === true;

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Deno.env.get("LOVABLE_API_KEY")) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!eventId || typeof eventId !== "string") {
      return new Response(JSON.stringify({ error: "event_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: hasAccess, error: accessErr } = await supabase.rpc("has_event_access", {
      _user_id: userId,
      _event_id: eventId,
    });
    if (accessErr || !hasAccess) {
      return new Response(JSON.stringify({ error: "Not authorized for this event" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Background mode without a client-created job: create the job server-side so RLS
    // never blocks the browser from starting generation.
    if (background && eventId && !jobId) {
      const { data: job, error: jobError } = await adminSupabase
        .from("image_generation_jobs")
        .insert({
          event_id: eventId,
          user_id: userId,
          prompt,
          template,
          count,
          tag: tag ?? null,
          style_seed_url: styleSeedUrl ?? null,
          status: "pending",
        })
        .select("id, count")
        .single();

      if (jobError || !job) {
        console.error("job create error:", jobError);
        return new Response(JSON.stringify({ error: "Could not start generation" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // @ts-ignore EdgeRuntime is provided by the Supabase Edge Runtime
      EdgeRuntime.waitUntil(
        processJob({ supabase, adminSupabase, userId, jobId: job.id, prompt, template, count, eventId, tag, styleSeedUrl })
          .catch((e) => console.error("background job failed:", e)),
      );

      return new Response(JSON.stringify({ accepted: true, job_id: job.id, count: job.count }), {
        status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Background mode: when a job_id is provided, kick off processing and return immediately.
    if (jobId) {
      // @ts-ignore EdgeRuntime is provided by the Supabase Edge Runtime
      EdgeRuntime.waitUntil(
        processJob({ supabase, adminSupabase, userId, jobId, prompt, template, count, eventId, tag, styleSeedUrl })
          .catch((e) => console.error("background job failed:", e)),
      );
      return new Response(JSON.stringify({ accepted: true, job_id: jobId }), {
        status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Synchronous fallback (e.g. pre-event AICoverImageDialog).
    const uploaded = await processJob({
      supabase, adminSupabase, userId, prompt, template, count, eventId, tag, styleSeedUrl,
    });
    return new Response(JSON.stringify({ images: uploaded }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-cover-image error:", e);
    const msg = e?.message || "An internal error occurred. Please try again.";
    const status = /rate limit/i.test(msg) ? 429 : /credits/i.test(msg) ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
