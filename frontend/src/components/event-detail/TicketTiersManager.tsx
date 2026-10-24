import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Crown, Ticket, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type TicketTier = {
  id: string;
  name: string;
  description?: string | null;
  price: number; // in main currency units (e.g. dollars)
  currency: string;
  capacity: number | null;
  is_vip: boolean;
};

interface Props {
  tiers: TicketTier[];
  currency?: string;
  onChange: (tiers: TicketTier[]) => void;
}

const newTier = (currency: string): TicketTier => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  price: 0,
  currency,
  capacity: null,
  is_vip: false,
});

const formatPrice = (price: number, currency = "USD") => {
  if (!price) return "Free";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
};

export default function TicketTiersManager({ tiers, currency = "USD", onChange }: Props) {
  const [editing, setEditing] = useState<TicketTier | null>(null);
  const [isNew, setIsNew] = useState(false);

  const openNew = () => {
    setEditing(newTier(currency));
    setIsNew(true);
  };

  const openEdit = (t: TicketTier) => {
    setEditing({ ...t });
    setIsNew(false);
  };

  const onSave = () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Ticket name is required");
      return;
    }
    if (editing.price < 0) {
      toast.error("Price can't be negative");
      return;
    }
    const next = isNew
      ? [...tiers, editing]
      : tiers.map((t) => (t.id === editing.id ? editing : t));
    onChange(next);
    setEditing(null);
    toast.success(isNew ? "Ticket added" : "Ticket updated");
  };

  const onDelete = (id: string) => {
    if (!confirm("Delete this ticket tier?")) return;
    onChange(tiers.filter((t) => t.id !== id));
  };

  return (
    <div className="bg-card rounded-xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold">Tickets</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add free or paid tiers. Leave empty for a single free RSVP.
          </p>
        </div>
        <Button size="sm" onClick={openNew} className="rounded-full gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add ticket
        </Button>
      </div>

      {tiers.length === 0 ? (
        <div className="text-center py-10 rounded-xl bg-muted/30 text-sm text-muted-foreground">
          No tickets yet — add one to start selling or offer multiple RSVP options.
        </div>
      ) : (
        <div className="space-y-2">
          {tiers.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/40"
            >
              <div className={`shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center ${t.is_vip ? "bg-primary/15 text-primary" : "bg-muted text-foreground"}`}>
                {t.is_vip ? <Crown className="w-4 h-4" /> : <Ticket className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{t.name || "Untitled"}</span>
                  {t.is_vip && (
                    <span className="text-[9px] uppercase tracking-widest text-primary font-semibold">VIP</span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-display font-semibold">{formatPrice(t.price, t.currency || currency)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {t.capacity == null ? "Unlimited" : `${t.capacity} seats`}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(t.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "New ticket" : "Edit ticket"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={editing.name}
                  placeholder="General admission"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price ({editing.currency})</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.price}
                  onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={editing.currency}
                  onChange={(e) => setEditing({ ...editing, currency: e.target.value.toUpperCase().slice(0, 3) })}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  rows={2}
                  value={editing.description ?? ""}
                  placeholder="What's included?"
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="rounded-2xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Capacity (blank = unlimited)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.capacity ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      capacity: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="rounded-full"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 h-11">
                <div className="flex items-center gap-2 text-sm">
                  <Crown className="w-4 h-4 text-primary" /> VIP tier
                </div>
                <Switch
                  checked={editing.is_vip}
                  onCheckedChange={(v) => setEditing({ ...editing, is_vip: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={onSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
