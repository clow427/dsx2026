import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

const AcceptCohostInvitation = () => {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<{ event_id: string | null; scope: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing invitation token.");
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_cohost_invitation" as any, { _token: token } as any);
      if (error) {
        setError(error.message);
      } else if (!data) {
        setError("Invitation not found.");
      } else {
        setInfo(data as any);
      }
      setLoading(false);
    })();
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    const { data, error } = await supabase.rpc("accept_cohost_invitation" as any, { _token: token } as any);
    setAccepting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as any;
    setAccepted(result);
    toast.success("Invitation accepted!");
  };

  if (loading || authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card rounded-3xl p-8 space-y-6">
        <Link to="/" className="flex justify-center"><Logo /></Link>

        {error && (
          <div className="text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="font-display text-2xl font-bold">Invitation issue</h1>
            <p className="text-muted-foreground">{error}</p>
            <Button asChild variant="outline" className="rounded-full"><Link to="/">Go home</Link></Button>
          </div>
        )}

        {!error && info && accepted && (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h1 className="font-display text-2xl font-bold">You're a co-host!</h1>
            <p className="text-muted-foreground">
              {accepted.scope === "account"
                ? "You can now collaborate on all of their events."
                : info.event_name
                  ? `You can now collaborate on "${info.event_name}".`
                  : "You can now collaborate on the event."}
            </p>
            <Button
              onClick={() => navigate(accepted.event_id ? `/dashboard/events/${accepted.event_id}` : "/dashboard/events")}
              className="rounded-full w-full"
            >
              Open dashboard
            </Button>
          </div>
        )}

        {!error && info && !accepted && (
          <div className="text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <UserPlus className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold">Co-host invitation</h1>
              <p className="text-muted-foreground">
                <strong>{info.inviter_name || info.inviter_company || "Someone"}</strong> invited you to co-host
                {info.event_name ? <> on <strong>"{info.event_name}"</strong></> : info.scope === "account" ? <> across all of their events</> : null}.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">Sent to <strong>{info.email}</strong></p>

            {info.status !== "pending" ? (
              <p className="text-sm text-destructive">This invitation is {info.status}.</p>
            ) : !user ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Sign in with <strong>{info.email}</strong> to accept.</p>
                <Button
                  onClick={() => navigate(`/auth?redirect=${encodeURIComponent(`/cohost/accept?token=${token}`)}`)}
                  className="rounded-full w-full"
                >
                  Sign in to accept
                </Button>
              </div>
            ) : user.email?.toLowerCase() !== String(info.email).toLowerCase() ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">You're signed in as {user.email}. Sign in with {info.email} to accept this invitation.</p>
                <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate(`/auth?redirect=${encodeURIComponent(`/cohost/accept?token=${token}`)}`); }} className="rounded-full w-full">
                  Sign out and switch account
                </Button>
              </div>
            ) : (
              <Button onClick={handleAccept} disabled={accepting} className="rounded-full w-full">
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Accept invitation"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptCohostInvitation;
