import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Send, UserPlus, Plus, Trash2, Sun, Moon, Monitor, Copy, X, Globe, Calendar } from "lucide-react";
import { useTheme } from "next-themes";
import { copyToClipboard } from "@/lib/clipboard";
import { useEvents } from "@/hooks/useEvents";
import { useInvitations, useCohosts, useCreateInvitation, useRevokeInvitation, useRemoveCohost, getAcceptUrl } from "@/hooks/useCohosts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const SOCIAL_PLATFORMS = [
  "Twitter / X", "LinkedIn", "Instagram", "Facebook", "YouTube", "TikTok", "GitHub",
];

type SocialLink = { platform: string; url: string };

function generateCompanySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).substring(2, 6);
}

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [companySlug, setCompanySlug] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteScope, setInviteScope] = useState<"account" | "event">("account");
  const [inviteEventId, setInviteEventId] = useState<string>("");

  const { data: events } = useEvents();
  const { data: invitations } = useInvitations();
  const { data: cohostsList } = useCohosts();
  const createInvite = useCreateInvitation();
  const revokeInvite = useRevokeInvitation();
  const removeCohost = useRemoveCohost();

  const eventNameById = (id: string | null) =>
    id ? events?.find(e => e.id === id)?.name || "Event" : null;

  useEffect(() => {
    if (profile && !initialized) {
      setFullName(profile.full_name || "");
      setCompany(profile.company || "");
      setWebsite((profile as any).website || "");
      setCompanyDescription((profile as any).company_description || "");
      const links = (profile as any).social_links;
      setSocialLinks(Array.isArray(links) ? links : []);
      setCompanySlug((profile as any).company_slug || "");
      setInitialized(true);
    }
  }, [profile, initialized]);

  const handleSave = async () => {
    try {
      const slug = companySlug || (company ? generateCompanySlug(company) : undefined);
      await updateProfile.mutateAsync({
        full_name: fullName,
        company,
        website,
        company_description: companyDescription,
        social_links: socialLinks,
        ...(slug ? { company_slug: slug } : {}),
      } as any);
      if (slug) setCompanySlug(slug);
      toast.success("Profile updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (inviteScope === "event" && !inviteEventId) {
      toast.error("Pick an event to share");
      return;
    }
    if (email === user?.email?.toLowerCase()) {
      toast.error("You can't invite yourself");
      return;
    }
    setInviteSending(true);
    try {
      const inv = await createInvite.mutateAsync({
        email,
        scope: inviteScope,
        event_id: inviteScope === "event" ? inviteEventId : null,
      });
      const acceptUrl = getAcceptUrl(inv.token);

      // Try to send the invite email; fall back to copy link if email fails
      let emailed = false;
      try {
        const { error: emailErr } = await supabase.functions.invoke("notify", {
          body: { kind: "cohost_invitation", invitation_id: inv.id },
        });
        if (!emailErr) emailed = true;
      } catch (_) {
        // ignore — fall back below
      }


      await copyToClipboard(acceptUrl);
      toast.success(
        emailed
          ? `Invite sent to ${email} — link also copied to clipboard.`
          : `Invite created — link copied to clipboard. Send it to ${email}.`
      );
      setInviteEmail("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create invitation");
    } finally {
      setInviteSending(false);
    }
  };

  const addSocialLink = () => setSocialLinks([...socialLinks, { platform: "", url: "" }]);
  const updateSocialLink = (index: number, field: keyof SocialLink, value: string) => {
    const updated = [...socialLinks];
    updated[index] = { ...updated[index], [field]: value };
    setSocialLinks(updated);
  };
  const removeSocialLink = (index: number) => setSocialLinks(socialLinks.filter((_, i) => i !== index));

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="bg-muted rounded-full p-1">
          <TabsTrigger value="profile" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">Profile</TabsTrigger>
          <TabsTrigger value="appearance" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">Appearance</TabsTrigger>
          <TabsTrigger value="team" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <div className="bg-card rounded-xl p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} className="rounded-full" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled className="rounded-full" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} className="rounded-full" />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourcompany.com" className="rounded-full" />
            </div>
            <div className="space-y-2">
              <Label>Company description</Label>
              <Textarea
                value={companyDescription}
                onChange={e => setCompanyDescription(e.target.value)}
                placeholder="A short description of your company or organization…"
                rows={3}
                className="rounded-xl"
              />
            </div>


            <div className="space-y-3">
              <Label>Social media</Label>
              {socialLinks.map((link, i) => (
                <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Select value={link.platform} onValueChange={v => updateSocialLink(i, "platform", v)}>
                    <SelectTrigger className="w-full sm:w-40 shrink-0 rounded-full">
                      <SelectValue placeholder="Platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOCIAL_PLATFORMS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={link.url}
                    onChange={e => updateSocialLink(i, "url", e.target.value)}
                    placeholder="https://…"
                    className="flex-1 rounded-full"
                  />
                  <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive self-end sm:self-auto" onClick={() => removeSocialLink(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addSocialLink} className="rounded-full">
                <Plus className="w-4 h-4 mr-1" /> Add social
              </Button>
            </div>

            <Button onClick={handleSave} disabled={updateProfile.isPending} className="rounded-full">
              {updateProfile.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="appearance" className="mt-6">
          <div className="bg-card rounded-xl p-6 space-y-6">
            <div>
              <h3 className="font-display font-semibold text-lg mb-1">Theme</h3>
              <p className="text-sm text-muted-foreground">Choose how the application looks for you.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { value: "light", label: "Light", icon: Sun, desc: "Clean and bright interface" },
                { value: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes" },
                { value: "system", label: "System", icon: Monitor, desc: "Match your device settings" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setTheme(opt.value); toast.success(`Theme set to ${opt.label}`); }}
                  className={`relative flex flex-col items-center gap-3 rounded-xl p-6 transition-all cursor-pointer ${
                    theme === opt.value
                      ? "bg-muted ring-2 ring-foreground shadow-sm"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    theme === opt.value ? "bg-foreground text-background" : "bg-background text-muted-foreground"
                  }`}>
                    <opt.icon className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-6 space-y-6">
          <div className="bg-card rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-display font-semibold text-lg">Invite co-hosts</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Co-hosts can fully edit event details, manage attendees, branding, and registration — but can't delete events.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInviteScope("account")}
                className={`flex items-start gap-3 rounded-xl p-4 text-left transition-all ${
                  inviteScope === "account" ? "bg-muted ring-2 ring-foreground" : "bg-muted/40 hover:bg-muted"
                }`}
              >
                <Globe className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">All my events</p>
                  <p className="text-xs text-muted-foreground">Account-wide co-host</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setInviteScope("event")}
                className={`flex items-start gap-3 rounded-xl p-4 text-left transition-all ${
                  inviteScope === "event" ? "bg-muted ring-2 ring-foreground" : "bg-muted/40 hover:bg-muted"
                }`}
              >
                <Calendar className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">One event</p>
                  <p className="text-xs text-muted-foreground">Per-event co-host</p>
                </div>
              </button>
            </div>

            {inviteScope === "event" && (
              <Select value={inviteEventId} onValueChange={setInviteEventId}>
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Pick an event…" />
                </SelectTrigger>
                <SelectContent>
                  {(events || []).filter(e => e.user_id === user?.id).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="colleague@email.com"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInvite()}
                className="flex-1 rounded-full"
              />
              <Button
                className="shrink-0 w-full sm:w-auto rounded-full"
                onClick={handleInvite}
                disabled={inviteSending || !inviteEmail.trim()}
              >
                {inviteSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Send invite</>}
              </Button>
            </div>
          </div>

          {/* Pending invitations */}
          {invitations && invitations.filter((i: any) => i.status === "pending").length > 0 && (
            <div className="bg-card rounded-xl p-6 space-y-3">
              <h3 className="font-display font-semibold text-lg">Pending invitations</h3>
              <div className="space-y-2">
                {invitations.filter((i: any) => i.status === "pending").map((i: any) => (
                  <div key={i.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{i.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.scope === "account" ? "All events" : eventNameById(i.event_id) || "Event"} · expires {new Date(i.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 self-end sm:self-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={async () => {
                          const ok = await copyToClipboard(getAcceptUrl(i.token));
                          toast[ok ? "success" : "error"](ok ? "Link copied!" : "Couldn't copy.");
                        }}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy link
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground hover:text-destructive"
                        onClick={() => revokeInvite.mutate(i.id)}
                        title="Revoke invitation"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active co-hosts */}
          {cohostsList && cohostsList.length > 0 && (
            <div className="bg-card rounded-xl p-6 space-y-3">
              <h3 className="font-display font-semibold text-lg">Active co-hosts</h3>
              <div className="space-y-2">
                {cohostsList.map((c: any) => {
                  const matchingInvite = invitations?.find((i: any) => i.accepted_by === c.cohost_user_id && i.event_id === c.event_id);
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{matchingInvite?.email || "Co-host"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-xs rounded-full">
                            {c.event_id ? eventNameById(c.event_id) || "Event" : "All events"}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground hover:text-destructive"
                        onClick={() => removeCohost.mutate(c.id)}
                        title="Remove co-host"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
