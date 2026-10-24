import { Plus, Trash2, Ticket, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export type TicketTier = { id: string; name: string; price: string };

const SUGGESTIONS = ["General Admission", "Early Bird", "VIP", "Student", "Group"];

interface Props {
  tiers: TicketTier[];
  onChange: (tiers: TicketTier[]) => void;
}

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

export function TicketTiers({ tiers, onChange }: Props) {
  const update = (id: string, patch: Partial<TicketTier>) => {
    onChange(tiers.map(t => (t.id === id ? { ...t, ...patch } : t)));
  };
  const remove = (id: string) => onChange(tiers.filter(t => t.id !== id));
  const add = () => {
    const used = new Set(tiers.map(t => t.name.trim().toLowerCase()));
    const next = SUGGESTIONS.find(s => !used.has(s.toLowerCase())) ?? `Tier ${tiers.length + 1}`;
    onChange([...tiers, { id: newId(), name: next, price: "" }]);
  };

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {tiers.map((tier, idx) => (
          <motion.div
            key={tier.id}
            layout
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="group relative rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors p-3 pl-2.5"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center justify-center w-7 shrink-0 text-muted-foreground">
                <GripVertical className="w-3.5 h-3.5 opacity-40" />
                <Ticket className="w-3.5 h-3.5 mt-0.5 text-primary/70" />
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <Input
                  value={tier.name}
                  onChange={e => update(tier.id, { name: e.target.value })}
                  placeholder={`Tier ${idx + 1} name`}
                  className="h-10 bg-background border-transparent shadow-none rounded-xl text-sm font-medium focus-visible:border-input focus-visible:ring-1"
                />
              </div>

              {/* Price */}
              <div className="relative w-28 sm:w-32 shrink-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground tabular-nums">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={tier.price}
                  onChange={e => update(tier.id, { price: e.target.value })}
                  placeholder="0.00"
                  className="h-10 pl-6 pr-2 bg-background border-transparent shadow-none rounded-xl text-sm tabular-nums text-right focus-visible:border-input focus-visible:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Remove */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(tier.id)}
                disabled={tiers.length <= 1}
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 disabled:opacity-30"
                aria-label="Remove ticket option"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        type="button"
        onClick={add}
        className="group w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-dashed border-border hover:border-primary/60 hover:bg-primary/5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
      >
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </span>
        Add ticket option
      </button>
    </div>
  );
}
