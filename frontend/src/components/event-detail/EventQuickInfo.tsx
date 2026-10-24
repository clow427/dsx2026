import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tables } from "@/integrations/supabase/types";
import { CalendarDays, MapPin, Type, FileText, Globe, DoorOpen, CalendarX, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import SmartImageField from "./SmartImageField";

interface Props {
  event: Tables<"events">;
  onUpdate: (fields: Partial<Tables<"events">>) => void;
}

export default function EventQuickInfo({ event, onUpdate }: Props) {
  const promptSeed = [
    event.name && `Cover photo for "${event.name}"`,
    event.event_type && `Event type: ${event.event_type}`,
    event.description && `About: ${event.description.slice(0, 280)}`,
    "Style: authentic candid photojournalism of real people experiencing this event — engaged faces, genuine emotion, warm cinematic lighting, shallow depth of field, natural skin tones, the energy and atmosphere of the moment. Documentary realism, NOT abstract, NOT illustration, NOT 3D render.",
  ].filter(Boolean).join(". ");

  return (
    <div className="bg-card rounded-xl p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column: Event Image */}
        <div className="space-y-2">
          <SmartImageField
            value={event.background_image_url ?? null}
            onChange={(url) => onUpdate({ background_image_url: url })}
            eventId={event.id}
            tag="cover"
            template="minimal"
            promptSeed={promptSeed}
            aspectClass="aspect-[16/10]"
            emptyLabel="Drop, click, or generate the event cover"
            position={(event as any).background_image_position ?? null}
            onPositionChange={(p) => onUpdate({ background_image_position: p } as any)}
            scale={(event as any).background_image_scale ?? null}
            onScaleChange={(s) => onUpdate({ background_image_scale: s } as any)}
          />
        </div>

        {/* Right column: All editable fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs flex items-center gap-1">
              <Type className="w-3 h-3" /> Event name
            </Label>
            <Input
              className="h-9 text-sm font-medium rounded-full"
              defaultValue={event.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== event.name) {
                  onUpdate({ name: e.target.value.trim() });
                }
              }}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs flex items-center gap-1">
              <FileText className="w-3 h-3" /> Description
            </Label>
            <Textarea
              className="text-sm min-h-[120px] resize-y rounded-2xl"
              defaultValue={event.description || ""}
              rows={5}
              onBlur={(e) => onUpdate({ description: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> Event date
            </Label>
            <Input
              type="datetime-local"
              className="h-9 text-sm rounded-full"
              defaultValue={event.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : ""}
              onBlur={(e) => onUpdate({ event_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> End date
            </Label>
            <Input
              type="datetime-local"
              className="h-9 text-sm rounded-full"
              defaultValue={event.event_end_date ? new Date(event.event_end_date).toISOString().slice(0, 16) : ""}
              onBlur={(e) => onUpdate({ event_end_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Globe className="w-3 h-3" /> Event type
            </Label>
            {(() => {
              const presets = ["webinar", "conference", "workshop", "hackathon", "meetup", "other"];
              const current = event.event_type || "webinar";
              const isCustom = !presets.includes(current);
              return (
                <Select value={current} onValueChange={v => onUpdate({ event_type: v })}>
                  <SelectTrigger className="h-9 text-sm rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isCustom && <SelectItem value={current} className="capitalize">{current}</SelectItem>}
                    <SelectItem value="webinar">Webinar</SelectItem>
                    <SelectItem value="conference">Conference</SelectItem>
                    <SelectItem value="workshop">Workshop</SelectItem>
                    <SelectItem value="hackathon">Hackathon</SelectItem>
                    <SelectItem value="meetup">Meetup</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              );
            })()}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location type
            </Label>
            <Select value={["virtual","physical","hybrid"].includes(event.location_type as string) ? event.location_type as string : "virtual"} onValueChange={v => onUpdate({ location_type: v })}>
              <SelectTrigger className="h-9 text-sm rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="virtual">Virtual</SelectItem>
                <SelectItem value="physical">Physical</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location / link
            </Label>
            <Input
              className="h-9 text-sm rounded-full"
              placeholder="Zoom link, venue address, etc."
              defaultValue={event.location_value || ""}
              onBlur={(e) => onUpdate({ location_value: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <DoorOpen className="w-3 h-3" /> Registration opens
            </Label>
            <Input
              type="datetime-local"
              className="h-9 text-sm rounded-full"
              defaultValue={(event as any).registration_opens_at ? new Date((event as any).registration_opens_at).toISOString().slice(0, 16) : ""}
              onBlur={(e) => onUpdate({ registration_opens_at: e.target.value ? new Date(e.target.value).toISOString() : null } as any)}
            />
            <p className="text-[10px] text-muted-foreground">Blank = open now</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <CalendarX className="w-3 h-3" /> Sales end
            </Label>
            <Input
              type="datetime-local"
              className="h-9 text-sm rounded-full"
              defaultValue={event.registration_deadline ? new Date(event.registration_deadline).toISOString().slice(0, 16) : ""}
              onBlur={(e) => onUpdate({ registration_deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
            <p className="text-[10px] text-muted-foreground">Blank = no deadline</p>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-full bg-muted/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium leading-tight">Waitlist</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Collect sign-ups once capacity is reached.</p>
              </div>
            </div>
            <Switch
              checked={!!(event as any).waitlist_enabled}
              onCheckedChange={(v) => onUpdate({ waitlist_enabled: v } as any)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
