import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  /** ISO date string YYYY-MM-DD */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** ISO date string — disable dates before this one */
  minDate?: string;
};

function toDate(v: string): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

export function DateField({ value, onChange, placeholder = "Pick a date", className, minDate }: Props) {
  const [open, setOpen] = useState(false);
  const date = toDate(value);
  const min = toDate(minDate || "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-base md:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors hover:bg-accent/40",
            !date && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{date ? format(date, "EEE, MMM d, yyyy") : placeholder}</span>
          <CalendarIcon className="h-4 w-4 opacity-60 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          disabled={min ? (d) => d < min : undefined}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
