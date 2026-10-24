import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Trash2, Sun, Moon } from "lucide-react";
import { useEvent, useUpdateEvent, useDeleteEvent, useEventEmailConfig } from "@/hooks/useEvents";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useFormFields, useAddFormField, useDeleteFormField, useUpdateFormField } from "@/hooks/useFormFields";
import { useRegistrationsByEvent } from "@/hooks/useRegistrations";
import { toast } from "sonner";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TemplatePreview from "@/components/TemplatePreview";
import EventDetailHeader from "@/components/event-detail/EventDetailHeader";
import EventQuickInfo from "@/components/event-detail/EventQuickInfo";
import EventAttendeesTable from "@/components/event-detail/EventAttendeesTable";
import CheckInScanner from "@/components/event-detail/CheckInScanner";

import EventPromotion from "@/components/event-detail/EventPromotion";
import EventPageBuilder from "@/components/event-detail/EventPageBuilder";
import EventOverview from "@/components/event-detail/EventOverview";
import EventSideNav, { type EventSection } from "@/components/event-detail/EventSideNav";
import TicketTiersManager, { type TicketTier } from "@/components/event-detail/TicketTiersManager";
import { getRegistrationUrl } from "@/lib/publicUrl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: event, isLoading } = useEvent(id);
  const { data: formFields } = useFormFields(id);
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const addField = useAddFormField();
  const deleteField = useDeleteFormField();
  const updateField = useUpdateFormField();
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [activeTab, setActiveTab] = useState<EventSection>("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: registrations } = useRegistrationsByEvent(id);
  const { data: emailConfig } = useEventEmailConfig(id);
  const qc = useQueryClient();
  const attendeesCount = registrations?.length ?? 0;

  const handleEmailConfigUpdate = async (patch: Record<string, any>) => {
    const { error } = await (supabase as any).rpc("update_event_email_config", { p_event_id: id!, p_patch: patch });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["event-email-config", id] });
  };


  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (!event) {
    return <div className="text-center py-20"><p className="text-muted-foreground">Event not found.</p></div>;
  }

  const handleStatusChange = async (status: "draft" | "live" | "past") => {
    await updateEvent.mutateAsync({ id: event.id, status });
    toast.success(`Event is now ${status}`);
  };

  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    await deleteEvent.mutateAsync(event.id);
    setDeleteOpen(false);
    toast.success("Event deleted");
    navigate("/dashboard/events");
  };

  const handleUpdate = (fields: any) => {
    updateEvent.mutate({ id: event.id, ...fields });
  };

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    await addField.mutateAsync({
      event_id: event.id,
      label: newFieldLabel,
      field_type: newFieldType,
      required: false,
      position: (formFields?.length ?? 0),
    });
    setNewFieldLabel("");
    toast.success("Field added");
  };

  return (
    <div className="space-y-5">
      <EventDetailHeader event={event} onStatusChange={handleStatusChange} onDelete={handleDelete} />

      <div className="flex flex-col md:flex-row md:gap-5 md:items-start">
        <EventSideNav
          active={activeTab}
          onChange={setActiveTab}
          attendeesCount={attendeesCount}
        />

        <div className="flex-1 min-w-0 space-y-5 mt-4 md:mt-0">
          {activeTab === "overview" && (
            <>
              <EventQuickInfo event={event} onUpdate={handleUpdate} />
              <EventOverview event={event} onJumpTab={(t) => setActiveTab(t as EventSection)} />
            </>
          )}

          {activeTab === "branding" && (
            <div className="space-y-5">
              <div className="bg-card rounded-xl p-5 sm:p-6 space-y-4">
                <h3 className="font-display font-semibold">Brand customization</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Primary color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={event.primary_color || "#7C3AED"} className="w-10 h-10 rounded-xl border border-border cursor-pointer" onChange={e => handleUpdate({ primary_color: e.target.value })} />
                      <Input
                        defaultValue={event.primary_color || "#7C3AED"}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (/^#[0-9a-fA-F]{6}$/.test(v) && v.toLowerCase() !== (event.primary_color || "").toLowerCase()) {
                            handleUpdate({ primary_color: v });
                          }
                        }}
                        placeholder="#7C3AED"
                        className="rounded-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={event.template || "split"} onValueChange={v => handleUpdate({ template: v })}>
                      <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="split">Split screen</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="landing">Landing page</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Color mode</Label>
                  <div className="flex gap-2">
                    {(["light", "dark"] as const).map((mode) => {
                      const Icon = mode === "light" ? Sun : Moon;
                      const isActive = (event as any).color_mode === mode || (!((event as any).color_mode) && mode === "light");
                      return (
                        <Button
                          key={mode}
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          className="rounded-full gap-1.5"
                          onClick={() => handleUpdate({ color_mode: mode })}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {mode === "light" ? "Light" : "Dark"}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-card rounded-xl p-5 sm:p-6">
                  <Label className="mb-3 block">Live preview</Label>
                  <div className="flex justify-center">
                    <div className="origin-top scale-[0.72] -mb-16">
                      <TemplatePreview
                        template={event.template || "split"}
                        eventName={event.name}
                        description={event.description || ""}
                        startDate={event.event_date ? new Date(event.event_date).toISOString().split("T")[0] : ""}
                        startTime={event.event_date ? new Date(event.event_date).toTimeString().slice(0, 5) : ""}
                        locationType={(event.location_type as "virtual" | "physical" | "hybrid") || "virtual"}
                        locationValue={event.location_value || ""}
                        locationAddress=""
                        flyerUrl={event.background_image_url}
                        colorMode={((event as any).color_mode as "light" | "dark") || "light"}
                      />

                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "form" && (
            <div className="space-y-5">
              <TicketTiersManager
                tiers={(((event as any).ticket_tiers as TicketTier[]) ?? [])}
                onChange={(tiers) => handleUpdate({ ticket_tiers: tiers } as any)}
              />

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-card rounded-xl p-5 sm:p-6 space-y-4">
                  <div>
                    <h3 className="font-display font-semibold">Form fields</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Name, email, and phone are collected by default.</p>
                  </div>
                  {formFields?.map((field) => (
                    <div key={field.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                      <div>
                        <span className="text-sm font-medium">{field.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">({field.field_type})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateField.mutate({ id: field.id, eventId: event.id, patch: { required: !field.required } })}
                          className={`text-xs rounded-full px-3 py-1 font-medium transition-colors ${field.required ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                          aria-label={`Toggle required for ${field.label}`}
                          title="Click to toggle required/optional"
                        >
                          {field.required ? "Required" : "Optional"}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteField.mutate({ id: field.id, eventId: event.id })}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input placeholder="Field label" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} className="flex-1 rounded-full" />
                    <Select value={newFieldType} onValueChange={setNewFieldType}>
                      <SelectTrigger className="w-full sm:w-28 rounded-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="tel">Phone</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={handleAddField} className="rounded-full">Add</Button>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-xl p-5 sm:p-6">
                  <h3 className="font-display font-semibold mb-4">Live preview</h3>
                  <div className="bg-card rounded-xl p-4 sm:p-6 space-y-4">
                    <h4 className="text-lg font-semibold">{event.name}</h4>
                    <p className="text-sm text-muted-foreground">{event.description || "No description"}</p>
                    {(((event as any).ticket_tiers as TicketTier[]) ?? []).length > 0 && (
                      <div className="space-y-2">
                        {(((event as any).ticket_tiers as TicketTier[]) ?? []).map((t) => (
                          <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{t.name || "Untitled"}</div>
                              {t.description && <div className="text-xs text-muted-foreground truncate">{t.description}</div>}
                            </div>
                            <div className="text-sm font-display font-semibold">
                              {t.price ? new Intl.NumberFormat(undefined, { style: "currency", currency: t.currency || "USD", maximumFractionDigits: 0 }).format(t.price) : "Free"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {formFields?.map((f) => (
                      <div key={f.id} className="space-y-1">
                        <Label className="text-xs">{f.label}{f.required && " *"}</Label>
                        <Input placeholder={f.placeholder || f.label} disabled className="bg-muted/50 rounded-full" />
                      </div>
                    ))}
                    <Button className="w-full rounded-full" disabled>Register now</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "page" && (
            <EventPageBuilder
              eventId={event.id}
              eventSlug={event.slug}
              eventName={event.name}
              description={event.description}
              eventDate={event.event_date}
              locationType={event.location_type}
              brandColor={event.primary_color || undefined}
              coverImageUrl={event.background_image_url}
            />
          )}

          {activeTab === "promotion" && (
            <EventPromotion eventSlug={event.slug} eventId={event.id} eventName={event.name} />
          )}

          {activeTab === "attendees" && (
            <div className="bg-card rounded-xl p-5 sm:p-6">
              <EventAttendeesTable eventId={event.id} />
            </div>
          )}

          {activeTab === "checkin" && (
            <div className="bg-card rounded-xl p-5 sm:p-6">
              <CheckInScanner eventId={event.id} />
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-card rounded-xl p-5 sm:p-6 space-y-4">
              <h3 className="font-display font-semibold">Event settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Registration limit</Label>
                  <Input type="number" placeholder="Unlimited" defaultValue={event.registration_limit ?? ""} onBlur={e => handleUpdate({ registration_limit: e.target.value ? parseInt(e.target.value) : null })} className="rounded-full" />
                </div>
                <div className="space-y-2">
                  <Label>Capacity</Label>
                  <Input type="number" placeholder="Unlimited" defaultValue={event.capacity ?? ""} onBlur={e => handleUpdate({ capacity: e.target.value ? parseInt(e.target.value) : null })} className="rounded-full" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">Registration window and waitlist are managed in the Overview tab.</p>

              <div className="space-y-3 mt-4">
                <h4 className="text-sm font-semibold">Email automations</h4>
                {[
                  { key: "send_confirmation_email", label: "Confirmation email on register", desc: "Branded confirmation with calendar invite, sent immediately." },
                  { key: "send_reminder_24h", label: "24-hour reminder", desc: "Sent the day before the event." },
                  { key: "send_reminder_1h", label: "1-hour reminder", desc: "Sent shortly before the event starts." },
                ].map((opt) => (
                  <div key={opt.key} className="flex items-center justify-between p-4 rounded-xl bg-muted/40">
                    <div className="pr-4">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                    <Switch
                      checked={!!(emailConfig as any)?.[opt.key]}
                      onCheckedChange={(v) => handleEmailConfigUpdate({ [opt.key]: v })}
                    />
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email intro (optional)</Label>
                    <Input key={`intro-${emailConfig?.email_intro ?? ""}`} defaultValue={emailConfig?.email_intro || ""} onBlur={e => handleEmailConfigUpdate({ email_intro: e.target.value || null })} placeholder="Thanks for signing up!" className="rounded-full" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sign-off (optional)</Label>
                    <Input key={`sig-${emailConfig?.email_signature ?? ""}`} defaultValue={emailConfig?.email_signature || ""} onBlur={e => handleEmailConfigUpdate({ email_signature: e.target.value || null })} placeholder="— The eventspark team" className="rounded-full" />
                  </div>
                </div>
              </div>


              <Button variant="destructive" size="sm" className="mt-4 rounded-full" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete event
              </Button>
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the event and all its registrations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-event" onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EventDetail;
