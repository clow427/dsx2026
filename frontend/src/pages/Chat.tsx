import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Linkedin, MessageSquarePlus, PanelLeft, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { AlumCard } from "@/components/chat/AlumCard";
import { ALUMNI } from "@/lib/alumniGraph";
import {
  alumniFromMessages,
  deleteThread,
  getThread,
  newThreadId,
  saveThread,
  useThreads,
  type FoundAlum,
} from "@/lib/chatStore";

const CHAT_API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alumni-chat`;
const SUGGESTIONS = [
  "I'm part of BU Spark and I want a job there",
  "I'm a BU CS student looking for a software internship at Google",
  "Find BU alumni doing vaccine research at Moderna",
  "I'm in Questrom and want to break into consulting",
];

/** /chat → open the most recent chat, or a fresh one. */
export function ChatIndex() {
  const threads = useThreads();
  const [fresh] = useState(() => newThreadId());
  return <Navigate to={`/chat/${threads[0]?.id ?? fresh}`} replace />;
}

export default function Chat() {
  const { threadId = "" } = useParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="h-[100dvh] flex bg-background text-foreground overflow-hidden" data-lenis-prevent>
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <ThreadList activeId={threadId} />
      </aside>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetTitle className="sr-only">Your chats</SheetTitle>
          <ThreadList activeId={threadId} onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
      <ChatWindow key={threadId} threadId={threadId} onOpenThreads={() => setSheetOpen(true)} />
    </div>
  );
}

function ThreadList({ activeId, onNavigate }: { activeId: string; onNavigate?: () => void }) {
  const threads = useThreads();
  const navigate = useNavigate();
  const isSaved = threads.some((t) => t.id === activeId);

  const go = (id: string) => {
    navigate(`/chat/${id}`);
    onNavigate?.();
  };

  const remove = (id: string) => {
    deleteThread(id);
    if (id === activeId) {
      const next = threads.find((t) => t.id !== id);
      go(next ? next.id : newThreadId());
    }
  };

  return (
    <>
      <div className="h-16 px-4 flex items-center border-b border-border">
        <Link to="/" aria-label="6degrees home"><Logo size="sm" /></Link>
      </div>
      <div className="p-3">
        <Button className="w-full justify-start gap-2 font-semibold" onClick={() => go(newThreadId())}>
          <MessageSquarePlus className="w-4 h-4" /> New chat
        </Button>
      </div>
      <p className="px-4 pt-2 pb-1 text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">Your chats</p>
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {!isSaved && (
          <div className="rounded-xl bg-primary/10 text-primary px-3 py-2 text-sm font-medium">New chat</div>
        )}
        {threads.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center rounded-xl ${t.id === activeId ? "bg-primary/10" : "hover:bg-muted"}`}
          >
            <button
              type="button"
              onClick={() => go(t.id)}
              className={`flex-1 min-w-0 text-left px-3 py-2 text-sm truncate ${t.id === activeId ? "text-primary font-medium" : "text-foreground"}`}
            >
              {t.title}
            </button>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 text-muted-foreground hover:text-destructive transition-opacity"
              aria-label={`Delete chat ${t.title}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {threads.length === 0 && isSaved === false && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Chats are saved in this browser.</p>
        )}
      </nav>
    </>
  );
}

function errorMessage(err: Error) {
  const raw = err.message || "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
  } catch {
    /* not JSON */
  }
  if (/failed to fetch|network/i.test(raw)) return "Can't reach 6degrees right now. Check your connection and try again.";
  return raw || "Something went wrong. Please try again.";
}

function ChatWindow({ threadId, onOpenThreads }: { threadId: string; onOpenThreads: () => void }) {
  const [initial] = useState<UIMessage[]>(() => getThread(threadId)?.messages ?? []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API,
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      }),
    [],
  );
  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const composerRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  // Persist after each change, but not on every streamed token.
  useEffect(() => {
    if (status === "streaming" || messages.length === 0) return;
    saveThread(threadId, messages);
  }, [messages, status, threadId]);

  // Keep the composer focused during normal use.
  useEffect(() => {
    if (!busy) composerRef.current?.querySelector("textarea")?.focus();
  }, [busy, threadId]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
  };

  const alumni = useMemo(() => alumniFromMessages(messages), [messages]);
  const last = messages[messages.length - 1];
  const waiting = status === "submitted" || (busy && last?.role === "user");

  return (
    <>
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 px-4 md:px-6 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onOpenThreads} aria-label="Open chats">
              <PanelLeft className="w-4 h-4" />
            </Button>
            <h1 className="font-display font-bold text-lg tracking-tight">Find your BU connections</h1>
          </div>
          <span className="hidden sm:inline text-xs text-muted-foreground">Public LinkedIn search · real BU people</span>
        </header>

        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="max-w-3xl mx-auto w-full px-4 md:px-6 py-6 gap-6">
            {messages.length === 0 ? (
              <EmptyState onPick={send} />
            ) : (
              messages.map((m) => <ChatMessage key={m.id} message={m} />)
            )}
            {waiting && (
              <Message from="assistant">
                <MessageContent>
                  <Shimmer>Thinking…</Shimmer>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div ref={composerRef} className="shrink-0 px-4 md:px-6 pb-4 pt-2">
          <div className="max-w-3xl mx-auto w-full">
            <PromptInput onSubmit={(msg) => send(msg.text ?? "")} className="rounded-2xl bg-card shadow-sm">
              <PromptInputTextarea placeholder="Tell me your BU program and where you want to work…" autoFocus />
              <PromptInputFooter className="justify-end">
                <PromptInputSubmit status={status} onStop={stop} className="rounded-full" />
              </PromptInputFooter>
            </PromptInput>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Results come from public search listings and may be out of date.
            </p>
          </div>
        </div>
      </main>

      <RecentAlumni threadId={threadId} found={alumni} />
    </>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center text-center pt-10 md:pt-20">
      <Logo size="lg" />
      <h2 className="mt-6 text-3xl md:text-4xl font-display font-bold tracking-[-0.03em] leading-tight max-w-md">
        Who in the BU network can help you next?
      </h2>
      <p className="mt-3 text-muted-foreground max-w-md">
        Tell me your program and your goal. I'll search public LinkedIn profiles of BU people and explain why each one is a good connection.
      </p>
      <Suggestions className="mt-8 flex-wrap justify-center w-full">
        {SUGGESTIONS.map((s) => (
          <Suggestion key={s} suggestion={s} onClick={onPick} className="whitespace-normal h-auto py-2 text-left" />
        ))}
      </Suggestions>
    </div>
  );
}

function ChatMessage({ message }: { message: UIMessage }) {
  return (
    <Message from={message.role}>
      <MessageContent
        className={
          message.role === "user"
            ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground group-[.is-user]:rounded-2xl"
            : "w-full"
        }
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return message.role === "user" ? (
              <p key={i} className="whitespace-pre-wrap">{part.text}</p>
            ) : (
              <MessageResponse key={i}>{part.text}</MessageResponse>
            );
          }
          if (part.type === "tool-search_linkedin") {
            const p = part as any;
            const profiles = (p.output?.profiles ?? []) as { name: string; headline: string }[];
            const err = p.output?.error ?? p.errorText;
            return (
              <Tool key={i} defaultOpen={false} className="mb-0">
                <ToolHeader
                  type={p.type}
                  state={err && p.state === "output-available" ? "output-error" : p.state}
                  title={`Searched LinkedIn${p.input?.keywords ? `: ${p.input.keywords}` : ""}${p.output ? ` · ${profiles.length} found` : ""}`}
                  icon={<Linkedin className="size-4 text-primary" />}
                />
                <ToolContent>
                  <ToolInput input={p.input} />
                  <ToolOutput
                    errorText={err}
                    output={
                      profiles.length ? (
                        <ul className="p-3 space-y-1">
                          {profiles.map((pr, k) => (
                            <li key={k}><span className="font-semibold">{pr.name}</span> — {pr.headline}</li>
                          ))}
                        </ul>
                      ) : undefined
                    }
                  />
                </ToolContent>
              </Tool>
            );
          }
          if (part.type === "tool-show_alumni") {
            const p = part as any;
            if (p.state !== "output-available") {
              return <Shimmer key={i}>Picking your best connections…</Shimmer>;
            }
            const list = (p.output?.alumni ?? []) as FoundAlum[];
            if (!list.length) return null;
            return (
              <div key={i} className="grid sm:grid-cols-2 gap-3 my-1">
                {list.map((a, k) => <AlumCard key={a.url} alum={a} index={k} />)}
              </div>
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}

function RecentAlumni({ threadId, found }: { threadId: string; found: FoundAlum[] }) {
  const threads = useThreads();
  const elsewhere = useMemo(() => {
    const seen = new Set(found.map((a) => a.url));
    const out: FoundAlum[] = [];
    for (const t of threads) {
      if (t.id === threadId) continue;
      for (const a of alumniFromMessages(t.messages)) {
        if (seen.has(a.url)) continue;
        seen.add(a.url);
        out.push(a);
      }
    }
    return out.slice(0, 8);
  }, [threads, threadId, found]);

  return (
    <aside className="hidden xl:flex w-80 shrink-0 flex-col border-l border-border bg-muted/40">
      <div className="h-16 shrink-0 px-5 flex items-center gap-2 border-b border-border">
        <Users className="w-4 h-4 text-primary" />
        <h2 className="font-display font-bold text-base">Recent alumni</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {found.length > 0 && (
          <section className="space-y-3">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">Found in this chat</p>
            {found.map((a, i) => <AlumCard key={a.url} alum={a} index={i} compact />)}
          </section>
        )}
        {elsewhere.length > 0 && (
          <section className="space-y-3">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">From your other chats</p>
            {elsewhere.map((a, i) => <AlumCard key={a.url} alum={a} index={i + 1} compact />)}
          </section>
        )}
        {found.length === 0 && elsewhere.length === 0 && (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">People you find will show up here. Meanwhile, a few BU alumni from the 6degrees graph:</p>
            {ALUMNI.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3">
                {a.photo ? (
                  <img src={a.photo} alt={a.name} className="w-10 h-10 rounded-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{a.name}</p>
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-primary">{a.degree} · {a.field}</p>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
