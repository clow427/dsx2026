import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// JSON shape required for each section. Kept tight so the AI returns drop-in
// content the existing Landing components already render.
const SCHEMAS: Record<string, { description: string; schema: any }> = {
  hero: {
    description:
      "Marketing hero for 'eventspark', a free white-label tool for building event registration pages. Lowercase brand name. Energetic, confident, founder-friendly.",
    schema: {
      type: "object",
      properties: {
        badge: { type: "string", description: "Tiny uppercase eyebrow text. <= 32 chars." },
        headline_prefix: { type: "string", description: "First part of headline before rotating word. e.g. 'The event platform where ideas become'. <= 80 chars." },
        rotating_words: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 5,
          description: "3-5 short nouns that rotate at the end of the headline. Each <= 16 chars, end with a period.",
        },
        subhead: { type: "string", description: "1-2 sentence supporting line. <= 200 chars." },
        cta: { type: "string", description: "Primary button label. <= 24 chars." },
      },
      required: ["badge", "headline_prefix", "rotating_words", "subhead", "cta"],
      additionalProperties: false,
    },
  },
  popular_events: {
    description: "Heading block above a grid of community events.",
    schema: {
      type: "object",
      properties: {
        title_line_1: { type: "string" },
        title_line_2: { type: "string" },
        subhead: { type: "string" },
        cta_label: { type: "string" },
      },
      required: ["title_line_1", "title_line_2", "subhead", "cta_label"],
      additionalProperties: false,
    },
  },
  features: {
    description: "Bento grid of 4 product features. Headlines snappy, descriptions one sentence.",
    schema: {
      type: "object",
      properties: {
        eyebrow: { type: "string" },
        title_line_1: { type: "string" },
        title_line_2: { type: "string" },
        subhead: { type: "string" },
        items: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              tag: { type: "string", description: "Single word tag, uppercased on render." },
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["tag", "title", "description"],
            additionalProperties: false,
          },
        },
      },
      required: ["eyebrow", "title_line_1", "title_line_2", "subhead", "items"],
      additionalProperties: false,
    },
  },
  testimonials: {
    description: "5 short testimonials from event organizers. Authentic, specific, no clichés.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        items: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              quote: { type: "string" },
              name: { type: "string" },
              role: { type: "string" },
            },
            required: ["quote", "name", "role"],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "items"],
      additionalProperties: false,
    },
  },
  cta: {
    description: "Final dark call-to-action block.",
    schema: {
      type: "object",
      properties: {
        title_line_1: { type: "string" },
        title_line_2: { type: "string" },
        subhead: { type: "string" },
        cta_label: { type: "string" },
      },
      required: ["title_line_1", "title_line_2", "subhead", "cta_label"],
      additionalProperties: false,
    },
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return jsonResponse({ error: "AI not configured" }, 500);

    // Auth: verify caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResponse({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const sectionKey: string = body.section_key;
    const direction: string = (body.direction ?? "").toString().slice(0, 2000);
    const assetUrls: string[] = Array.isArray(body.asset_urls)
      ? body.asset_urls.slice(0, 4).filter((u: unknown) => typeof u === "string")
      : [];
    const persistAssets: boolean = body.persist_assets !== false;

    const cfg = SCHEMAS[sectionKey];
    if (!cfg) return jsonResponse({ error: "Unknown section_key" }, 400);

    // Load current content for context
    const { data: existing } = await admin
      .from("landing_sections")
      .select("content")
      .eq("section_key", sectionKey)
      .maybeSingle();

    const systemPrompt = `You write marketing copy for "eventspark", a free, white-label SaaS that helps anyone build branded event registration pages, track attendees, and grow their community.

Brand voice: confident, warm, clear, never corporate, never hyped. Lowercase brand name. Use plain language. Avoid emojis and exclamation marks.

Section context: ${cfg.description}

Return ONLY the structured JSON via the provided tool. No prose.`;

    const userParts: any[] = [
      {
        type: "text",
        text: `Section: ${sectionKey}
Current content (improve, do not just copy):
${JSON.stringify(existing?.content ?? {}, null, 2)}

User direction (optional):
${direction || "(none — make it sharper, more specific, and on-brand)"}

${assetUrls.length ? `Reference images are attached. Use their mood, subject matter, or details for inspiration where relevant.` : ""}`,
      },
      ...assetUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "write_section",
              description: "Return the new section content.",
              parameters: cfg.schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "write_section" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      if (aiRes.status === 429) return jsonResponse({ error: "Rate limit reached, try again in a moment." }, 429);
      if (aiRes.status === 402) return jsonResponse({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }, 402);
      return jsonResponse({ error: "AI generation failed" }, 502);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("Missing tool call in AI response", JSON.stringify(aiJson));
      return jsonResponse({ error: "AI returned no content" }, 502);
    }

    let newContent: any;
    try {
      newContent = JSON.parse(toolCall.function.arguments);
    } catch {
      return jsonResponse({ error: "AI returned invalid JSON" }, 502);
    }

    // Persist
    const newAssets = persistAssets
      ? assetUrls.map((url) => ({ url, role: "reference" }))
      : (existing as any)?.assets ?? [];

    const { error: upErr } = await admin
      .from("landing_sections")
      .upsert({
        section_key: sectionKey,
        content: newContent,
        assets: newAssets,
        updated_by: userRes.user.id,
        updated_at: new Date().toISOString(),
      });

    if (upErr) {
      console.error("Upsert error", upErr);
      return jsonResponse({ error: "Failed to save section" }, 500);
    }

    return jsonResponse({ section_key: sectionKey, content: newContent, assets: newAssets });
  } catch (e) {
    console.error("regenerate-landing-section fatal", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
