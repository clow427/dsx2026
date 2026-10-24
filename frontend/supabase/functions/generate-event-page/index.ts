import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ModuleType = "why_attend" | "schedule" | "speakers" | "location" | "faq" | "sponsors" | "custom";

const IMAGE_SECTION_TYPES = new Set<ModuleType>(["why_attend", "schedule", "speakers", "location", "custom"]);

const SCHEMAS: Record<ModuleType, any> = {
  why_attend: {
    type: "object",
    properties: {
      heading: { type: "string" },
      bullets: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
    },
    required: ["heading", "bullets"],
    additionalProperties: false,
  },
  schedule: {
    type: "object",
    properties: {
      heading: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { time: { type: "string" }, title: { type: "string" } },
          required: ["time", "title"],
          additionalProperties: false,
        },
        minItems: 3,
        maxItems: 8,
      },
    },
    required: ["heading", "items"],
    additionalProperties: false,
  },
  speakers: {
    type: "object",
    properties: {
      heading: { type: "string" },
      people: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, role: { type: "string" }, avatar: { type: "string" } },
          required: ["name", "role", "avatar"],
          additionalProperties: false,
        },
        minItems: 2,
        maxItems: 4,
      },
    },
    required: ["heading", "people"],
    additionalProperties: false,
  },
  location: {
    type: "object",
    properties: {
      heading: { type: "string" },
      venue: { type: "string" },
      address: { type: "string" },
      mapUrl: { type: "string" },
    },
    required: ["heading", "venue", "address", "mapUrl"],
    additionalProperties: false,
  },
  faq: {
    type: "object",
    properties: {
      heading: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { q: { type: "string" }, a: { type: "string" } },
          required: ["q", "a"],
          additionalProperties: false,
        },
        minItems: 3,
        maxItems: 6,
      },
    },
    required: ["heading", "items"],
    additionalProperties: false,
  },
  sponsors: {
    type: "object",
    properties: {
      heading: { type: "string" },
      logos: { type: "array", items: { type: "string" } },
    },
    required: ["heading", "logos"],
    additionalProperties: false,
  },
  custom: {
    type: "object",
    properties: {
      heading: { type: "string" },
      body: { type: "string" },
    },
    required: ["heading", "body"],
    additionalProperties: false,
  },
};

function buildEventContext(event: any): string {
  const parts: string[] = [];
  parts.push(`Event name: ${event.name}`);
  if (event.event_type) parts.push(`Type: ${event.event_type}`);
  if (event.description) parts.push(`Description: ${event.description}`);
  if (event.event_date) parts.push(`Starts: ${event.event_date}`);
  if (event.event_end_date) parts.push(`Ends: ${event.event_end_date}`);
  if (event.location_type) parts.push(`Location type: ${event.location_type}`);
  if (event.location_value) parts.push(`Location: ${event.location_value}`);
  if (event.capacity) parts.push(`Capacity: ${event.capacity}`);
  return parts.join("\n");
}

function buildImagePrompt(type: ModuleType, event: any, heading: string): string {
  const eventType = event.event_type ? `${event.event_type} ` : "";
  const location = event.location_type === "virtual" ? "remote attendees and screens" : "modern venue attendees";
  return `Premium editorial photograph for the "${heading}" section of a modern ${eventType}event registration page for "${event.name}". Show ${location}, authentic people, cinematic natural light, glass aurora color palette, premium conference/webinar energy, realistic documentary style, no text, no logos, no UI mockups.`;
}

async function generateSectionImage(type: ModuleType, event: any, heading: string, authHeader: string): Promise<string | null> {
  if (!IMAGE_SECTION_TYPES.has(type)) return null;
  try {
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-cover-image`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildImagePrompt(type, event, heading),
        template: "section",
        count: 1,
        event_id: event.id,
        tag: `section:${type}`,
      }),
    });
    if (!resp.ok) {
      console.warn("section image generation failed", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = await resp.json();
    return data?.images?.[0]?.url ?? null;
  } catch (e) {
    console.warn("section image generation failed", e);
    return null;
  }
}

async function generateModule(type: ModuleType, event: any, apiKey: string): Promise<any> {
  const ctx = buildEventContext(event);
  const systemPrompt = `You are a professional event copywriter. Generate compelling, specific, on-brand content for an event landing page section. Tailor everything to the actual event details provided. Avoid generic filler. Keep copy concise and energetic. For the location section, only fill venue/address from what is explicitly given — if unknown, leave empty strings. For mapUrl, leave empty unless an exact address is provided. For sponsors, return empty logos array (the organizer will add their own). For speakers, only invent placeholder names if the description clearly mentions speakers; otherwise return realistic role placeholders the organizer can edit.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${ctx}\n\nGenerate the "${type}" section content tailored to this event.` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "emit_section",
          description: `Emit content for a ${type} section.`,
          parameters: SCHEMAS[type],
        },
      }],
      tool_choice: { type: "function", function: { name: "emit_section" } },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const txt = await response.text().catch(() => "");
    throw Object.assign(new Error(`AI gateway ${status}: ${txt}`), { status });
  }

  const data = await response.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("No structured output");
  return JSON.parse(call.function.arguments);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { event_id, mode = "section", type, with_image = false } = body as { event_id: string; mode?: "seed" | "section"; type?: ModuleType; with_image?: boolean };
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: event, error: evErr } = await supabase.from("events").select("*").eq("id", event_id).maybeSingle();
    if (evErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authorization: only the event owner or an authorized cohost may spend
    // AI credits for this event.
    const callerId = claimsData.claims.sub as string | undefined;
    const { data: hasAccess, error: accessErr } = await supabase.rpc("has_event_access", {
      _user_id: callerId,
      _event_id: event_id,
    });
    if (accessErr || !hasAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine which sections to generate
    let types: ModuleType[];
    if (mode === "seed") {
      types = ["why_attend"];
      if (event.event_date) types.push("schedule");
      if (event.location_type === "physical" || event.location_type === "hybrid") types.push("location");
      types.push("faq");
    } else {
      if (!type || !SCHEMAS[type]) {
        return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      types = [type];
    }

    try {
      const sections = await Promise.all(
        types.map(async (t) => ({ type: t, content: await generateModule(t, event, LOVABLE_API_KEY) }))
      );

      if (with_image) {
        await Promise.all(sections.map(async (section) => {
          const heading = section.content?.heading || section.type;
          const imageUrl = await generateSectionImage(section.type, event, heading, authHeader);
          if (imageUrl) section.content = { ...section.content, image_url: imageUrl };
        }));
      }

      // In seed mode, also try to generate a premium hero image for the first "why_attend" section.
      // Failure is non-fatal — the section is still useful without it.
      if (mode === "seed" && !with_image) {
        const heroIdx = sections.findIndex((s) => s.type === "why_attend");
        if (heroIdx >= 0) {
          try {
            const imgPrompt = `Editorial premium event hero image for "${event.name}". ${event.description ? `Theme: ${event.description}. ` : ""}${event.event_type ? `Event type: ${event.event_type}. ` : ""}Cinematic, soft volumetric light, modern minimal composition, abstract atmospheric, no text, no logos, no people faces in focus. 16:9.`;
            const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3.1-flash-image-preview",
                messages: [{ role: "user", content: imgPrompt }],
                modalities: ["image", "text"],
              }),
            });
            if (imgRes.ok) {
              const imgData = await imgRes.json();
              const imageUrl = imgData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
              if (imageUrl) {
                sections[heroIdx].content = { ...sections[heroIdx].content, image_url: imageUrl };
              }
            }
          } catch (imgErr) {
            console.warn("Hero image generation failed:", imgErr);
          }
        }
      }

      return new Response(JSON.stringify({ sections }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      const status = e?.status === 429 ? 429 : e?.status === 402 ? 402 : 500;
      const message = status === 429 ? "Rate limit exceeded, please try again later." :
                      status === 402 ? "AI credits exhausted. Please add credits." :
                      "Failed to generate content";
      console.error("generate-event-page error:", e);
      return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("generate-event-page error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
