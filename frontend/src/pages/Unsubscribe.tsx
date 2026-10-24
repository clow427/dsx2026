import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck, MailX, MailMinus } from "lucide-react";
import { Logo } from "@/components/Logo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "valid" | "already" | "invalid" | "submitting" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { apikey: ANON_KEY },
        });
        const data = await res.json();
        if (data.valid === true) setState("valid");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch (e: any) {
        setError(e?.message || "Could not validate this link.");
        setState("invalid");
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState("submitting");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success || data.reason === "already_unsubscribed") setState("done");
      else { setState("error"); setError(data?.error || "Something went wrong."); }
    } catch (e: any) {
      setState("error");
      setError(e?.message || "Network error.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="mb-8"><Logo size="md" /></div>
      <div className="w-full max-w-md bg-card rounded-2xl p-8 text-center space-y-5">
        {state === "loading" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking your link…</p>
          </>
        )}
        {state === "valid" && (
          <>
            <MailMinus className="w-10 h-10 mx-auto text-foreground" />
            <h1 className="text-2xl font-display font-semibold tracking-[-0.02em]">Unsubscribe?</h1>
            <p className="text-sm text-muted-foreground">
              You'll stop receiving emails sent through this app to your address.
            </p>
            <Button onClick={confirm} className="rounded-full w-full">Confirm unsubscribe</Button>
          </>
        )}
        {state === "submitting" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Updating preferences…</p>
          </>
        )}
        {state === "done" && (
          <>
            <MailCheck className="w-10 h-10 mx-auto text-primary" />
            <h1 className="text-2xl font-display font-semibold tracking-[-0.02em]">You're unsubscribed</h1>
            <p className="text-sm text-muted-foreground">We won't email you again from this app.</p>
          </>
        )}
        {state === "already" && (
          <>
            <MailCheck className="w-10 h-10 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-display font-semibold tracking-[-0.02em]">Already unsubscribed</h1>
            <p className="text-sm text-muted-foreground">This address is no longer receiving emails.</p>
          </>
        )}
        {(state === "invalid" || state === "error") && (
          <>
            <MailX className="w-10 h-10 mx-auto text-destructive" />
            <h1 className="text-2xl font-display font-semibold tracking-[-0.02em]">Link not valid</h1>
            <p className="text-sm text-muted-foreground">{error || "This unsubscribe link is invalid or expired."}</p>
          </>
        )}
      </div>
    </div>
  );
}
