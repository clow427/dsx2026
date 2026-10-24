// Chat threads saved in this browser (localStorage).
import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

export type FoundAlum = {
  url: string;
  name: string;
  headline: string;
  snippet: string;
  connection: string;
  reasons: string[];
};

const KEY = "6degrees.chats.v1";
const listeners = new Set<() => void>();
let cache: ChatThread[] | null = null;

function read(): ChatThread[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(next: ChatThread[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.error("Could not save chats", e);
  }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
      listeners.forEach((l) => l());
    }
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useThreads() {
  return useSyncExternalStore(subscribe, read, () => []);
}

export function getThread(id: string) {
  return read().find((t) => t.id === id);
}

function titleFrom(messages: UIMessage[]) {
  const first = messages.find((m) => m.role === "user");
  const text = first?.parts.find((p) => p.type === "text") as { text?: string } | undefined;
  const t = (text?.text ?? "New chat").trim().replace(/\s+/g, " ");
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

export function saveThread(id: string, messages: UIMessage[]) {
  if (messages.length === 0) return;
  const others = read().filter((t) => t.id !== id);
  const existing = read().find((t) => t.id === id);
  const thread: ChatThread = {
    id,
    title: existing?.title && existing.title !== "New chat" ? existing.title : titleFrom(messages),
    updatedAt: Date.now(),
    messages,
  };
  write([thread, ...others]);
}

export function deleteThread(id: string) {
  write(read().filter((t) => t.id !== id));
}

export function newThreadId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Alumni shown by the assistant in these messages, newest first, de-duplicated by profile URL. */
export function alumniFromMessages(messages: UIMessage[]): FoundAlum[] {
  const out: FoundAlum[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    for (let j = m.parts.length - 1; j >= 0; j--) {
      const p = m.parts[j] as any;
      if (p.type !== "tool-show_alumni" || p.state !== "output-available") continue;
      for (const a of (p.output?.alumni ?? []) as FoundAlum[]) {
        if (seen.has(a.url)) continue;
        seen.add(a.url);
        out.push(a);
      }
    }
  }
  return out;
}
