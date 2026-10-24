import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, ExternalLink, Copy, MoreVertical, Files, Trash2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { getRegistrationUrl } from "@/lib/publicUrl";
import { copyToClipboard } from "@/lib/clipboard";
import { useDuplicateEvent } from "@/hooks/useEvents";
import { formatDistanceToNow, differenceInDays } from "date-fns";

interface Props {
  event: Tables<"events">;
  onStatusChange: (status: "draft" | "live" | "past") => void;
  onDelete: () => void;
}

export default function EventDetailHeader({ event, onStatusChange, onDelete }: Props) {
  const navigate = useNavigate();
  const duplicate = useDuplicateEvent();

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(getRegistrationUrl(event.slug));
    if (!ok) return toast.error("Couldn't copy — select the link and copy manually.");
    toast.success("Registration link copied", {
      description: `Uses your "${event.template || "split"}" template.`,
    });
  };

  const handleDuplicate = async () => {
    try {
      const created = await duplicate.mutateAsync(event.id);
      toast.success("Event duplicated");
      navigate(`/dashboard/events/${created.id}`);
    } catch (e: any) {
      toast.error("Could not duplicate", { description: e?.message });
    }
  };

  const isLive = event.status === "live";
  const daysToEvent = event.event_date ? differenceInDays(new Date(event.event_date), new Date()) : null;
  const countdown =
    daysToEvent === null
      ? null
      : daysToEvent === 0
        ? "Today"
        : daysToEvent > 0
          ? `${daysToEvent}d to go`
          : `${Math.abs(daysToEvent)}d ago`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        {/* Left: Back + Title */}
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate("/dashboard/events")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-display font-bold truncate">{event.name}</h1>
              {countdown && (
                <Badge variant="outline" className="rounded-full text-[10px] font-medium border-0 bg-muted">
                  {countdown}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {event.event_date ? new Date(event.event_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "No date set"}
              {event.event_type ? ` · ${event.event_type}` : ""}
              {event.updated_at ? ` · edited ${formatDistanceToNow(new Date(event.updated_at), { addSuffix: true })}` : ""}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Live toggle (desktop) */}
          <div className="hidden sm:flex items-center gap-2 bg-muted rounded-full px-3 py-1.5">
            <Switch
              checked={isLive}
              onCheckedChange={(v) => onStatusChange(v ? "live" : "draft")}
              aria-label="Toggle live"
            />
            <span className={`text-xs font-medium ${isLive ? "text-success" : "text-muted-foreground"}`}>
              {isLive ? "Live" : event.status === "past" ? "Past" : "Draft"}
            </span>
          </div>
          <Button variant="outline" size="sm" className="hidden sm:inline-flex h-8 text-xs rounded-full" onClick={handleCopyLink}>
            <Copy className="w-3 h-3 mr-1" /> Copy link
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:inline-flex h-8 text-xs rounded-full" asChild>
            <a href={`/register/${event.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3 mr-1" /> Preview
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="sm:hidden">
                <DropdownMenuItem onClick={() => onStatusChange(isLive ? "draft" : "live")}>
                  {isLive ? "Set Draft" : "Set Live"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange("past")}>Set Past</DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyLink}><Copy className="w-3.5 h-3.5 mr-2" /> Copy link</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/register/${event.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-2" /> Preview
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </div>
              <DropdownMenuItem onClick={handleDuplicate} disabled={duplicate.isPending}>
                {duplicate.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Files className="w-3.5 h-3.5 mr-2" />
                )}
                Duplicate event
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete event
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
