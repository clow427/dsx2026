// 6degrees alumni chatbot.
// Streams an AI SDK UI-message response. The model can search public LinkedIn
// profiles of Boston University people (via Firecrawl web search) and then
// present grounded matches with reasons. Only profiles actually returned by a
// search in this request can be shown — the model cannot invent people.

import { corsHeaders as baseCors } from "npm:@supabase/supabase-js@2/cors";
import { createOpenAI } from "npm:@ai-sdk/openai@4.0.102";
import {
  convertToModelMessages,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "npm:ai@7.0.153";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "../_shared/ai-gateway/run-id.ts";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const MODEL = "openai/gpt-6-astra";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export type FoundProfile = {
  url: string;
  name: string;
  headline: string;
  snippet: string;
};

/** "Jane Doe - Data Scientist at X - LinkedIn" -> { name, headline } */
export function parseLinkedInTitle(title: string) {
  const cleaned = title.replace(/\s*[-|–]\s*LinkedIn\s*$/i, "").trim();
  const m = cleaned.match(/^(.+?)\s+[-|–]\s+(.+)$/);
  if (!m) return { name: cleaned, headline: "" };
  return { name: m[1].trim(), headline: m[2].trim() };
}

function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    return `https://www.linkedin.com${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return u;
  }
}

async function firecrawlSearch(query: string, lovableKey: string, firecrawlKey: string) {
  const res = await fetch(`${FIRECRAWL_GATEWAY}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": firecrawlKey,
    },
    body: JSON.stringify({ query, limit: 10 }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Firecrawl search failed [${res.status}]: ${text}`);
    let message = `Search failed (${res.status}).`;
    if (res.status === 402) message = "The workspace is out of credits for web search. A workspace owner can add more in Settings → Plans & credits.";
    else if (res.status === 403 && /credit limit/i.test(text)) message = "A workspace credit limit stopped the search. A workspace admin can raise it in workspace settings.";
    else if (res.status === 429) message = "Search is busy right now. Try again in a minute.";
    return { error: message };
  }
  const data = JSON.parse(text);
  const web: any[] = data?.data?.web ?? data?.data ?? [];
  return { results: Array.isArray(web) ? web : [] };
}

const INSTRUCTIONS = `You are 6degrees, a friendly networking assistant for Boston University (BU) students and alumni.
Your job: help the user find real BU people on LinkedIn who can help with their goal (a job, internship, mentorship, research), and explain clearly WHY each person is a good connection.

How to work:
1. When the user describes a goal or an organization, call search_linkedin. Pass focused keywords, e.g. "\\"BU Spark\\"" or "\\"Moderna\\" \\"data scientist\\"". The search is already limited to LinkedIn profiles mentioning Boston University. You may search up to 3 times with different keywords (e.g. the org name, then the role) to get good coverage.
2. Then call show_alumni ONCE with the 3–6 best matches. Use only profile URLs returned by search_linkedin in this conversation turn — never invent people, titles, degrees or years.
3. Each match needs:
   - connection: 2-5 words linking this person to the user's goal (e.g. "Director at BU Spark!", "Spark! engineer").
   - reasons: 2–3 short, specific reasons grounded ONLY in the search snippet and what the user told you (shared program, works at the target org, role that hires, BU degree, career path the user wants). Mention when someone looks like a current student rather than an alum.
4. After show_alumni, reply with a short message (under 120 words): who to contact first and why, and one concrete outreach tip (e.g. a 2-sentence message mentioning the shared BU connection). Do not repeat every card.
5. Note briefly that results come from public search listings and may be out of date.

If the user has not said what they want yet, ask one short question (their school/program and target org or role). If a search returns nothing useful, say so and suggest different keywords. If a tool returns an error, tell the user plainly and stop.
Keep answers concise and warm. Use markdown sparingly.`;

const MAX_MESSAGES = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!lovableKey) return json({ error: "AI is not configured (missing LOVABLE_API_KEY)." }, 500);
  if (!firecrawlKey) return json({ error: "Search is not configured (missing FIRECRAWL_API_KEY)." }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const messages = body?.messages as UIMessage[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return json({ error: `messages must be an array of 1-${MAX_MESSAGES} items` }, 400);
  }
  if (JSON.stringify(messages).length > 400_000) {
    return json({ error: "Conversation is too long. Start a new chat." }, 400);
  }

  // Profiles found by searches in this request, keyed by normalized URL.
  const found = new Map<string, FoundProfile>();

  const searchLinkedin = tool({
    description:
      "Search public LinkedIn profiles of Boston University people. Returns name, headline, snippet and profile URL for up to 10 profiles.",
    inputSchema: jsonSchema<{ keywords: string }>({
      type: "object",
      properties: {
        keywords: {
          type: "string",
          description: 'Search keywords, quoted for exact phrases, e.g. "\\"BU Spark\\"" or "\\"Google\\" \\"software engineer\\"".',
        },
      },
      required: ["keywords"],
      additionalProperties: false,
    }),
    execute: async ({ keywords }) => {
      const kw = String(keywords ?? "").slice(0, 200);
      const query = `site:linkedin.com/in "Boston University" ${kw}`;
      const r = await firecrawlSearch(query, lovableKey, firecrawlKey);
      if ("error" in r) return { query, error: r.error, profiles: [] as FoundProfile[] };
      const profiles: FoundProfile[] = [];
      for (const item of r.results) {
        const url = typeof item?.url === "string" ? item.url : "";
        if (!/linkedin\.com\/in\//i.test(url)) continue;
        const { name, headline } = parseLinkedInTitle(String(item.title ?? ""));
        const p: FoundProfile = {
          url: normalizeUrl(url),
          name,
          headline,
          snippet: String(item.description ?? "").slice(0, 400),
        };
        found.set(p.url, p);
        profiles.push(p);
      }
      return { query, profiles };
    },
  });

  const showAlumni = tool({
    description:
      "Show the best matching people to the user as cards with reasons. Only use profile URLs returned by search_linkedin.",
    inputSchema: jsonSchema<{ matches: { url: string; connection: string; reasons: string[] }[] }>({
      type: "object",
      properties: {
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "Exact profile URL from search_linkedin" },
              connection: { type: "string", description: "Short label linking this person to the user's goal" },
              reasons: { type: "array", items: { type: "string" }, description: "2-3 grounded reasons" },
            },
            required: ["url", "connection", "reasons"],
            additionalProperties: false,
          },
        },
      },
      required: ["matches"],
      additionalProperties: false,
    }),
    execute: async ({ matches }) => {
      const alumni = [] as (FoundProfile & { connection: string; reasons: string[] })[];
      const seen = new Set<string>();
      for (const m of matches ?? []) {
        const key = normalizeUrl(String(m.url ?? ""));
        const p = found.get(key);
        if (!p || seen.has(key)) continue;
        seen.add(key);
        alumni.push({
          ...p,
          connection: String(m.connection ?? "").slice(0, 80),
          reasons: (m.reasons ?? []).map((x) => String(x).slice(0, 240)).slice(0, 4),
        });
      }
      return { alumni, dropped: (matches?.length ?? 0) - alumni.length };
    },
  });

  try {
    const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
    const provider = createOpenAI({
      baseURL: AI_GATEWAY_URL,
      apiKey: lovableKey,
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const result = streamText({
      model: provider.responses(MODEL),
      instructions: INSTRUCTIONS,
      messages: await convertToModelMessages(messages),
      tools: { search_linkedin: searchLinkedin, show_alumni: showAlumni },
      stopWhen: stepCountIs(12),
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    return await withLovableAiGatewayRunIdHeader(
      result.toUIMessageStreamResponse({
        originalMessages: messages,
        sendReasoning: true,
        onError: (error: any) => {
          console.error("alumni-chat stream error:", error);
          const status = error?.statusCode ?? error?.status;
          if (status === 402) return "Out of AI credits. A workspace owner can add more in Settings → Plans & credits.";
          if (status === 429) return "Too many requests right now. Please try again in a minute.";
          if (status === 403) return error?.message ?? "The AI request was denied.";
          return "Something went wrong while answering. Please try again.";
        },
      }),
      runIdFetch,
      corsHeaders,
    );
  } catch (error: any) {
    if (error?.name === "AbortError") return json({ error: "Request cancelled" }, 499);
    console.error("alumni-chat failed:", error);
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
    return json({ error: error?.message ?? "Unexpected error" }, status);
  }
});
