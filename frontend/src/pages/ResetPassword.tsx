import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash automatically.
    // We confirm we're in a recovery session before allowing the update.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate("/dashboard/events", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8"><Logo size="lg" /></div>
        <div className="bg-card rounded-2xl border border-border shadow-lg p-6 sm:p-7">
          <h1 className="font-display text-2xl mb-1">Set a new password</h1>
          <p className="text-sm text-muted-foreground mb-6">Choose a strong password you haven't used before.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className="rounded-full h-11 px-4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} className="rounded-full h-11 px-4" />
            </div>
            <Button type="submit" className="w-full rounded-full h-11 bg-foreground text-background hover:bg-foreground/90" disabled={loading || !ready}>
              {loading ? "Updating…" : ready ? "Update password" : "Verifying link…"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
