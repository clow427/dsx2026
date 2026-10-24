import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Loader2, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Star, UserCheck, ArrowUpFromLine } from "lucide-react";
import { useRegistrationsByEvent, useUpdateRegistration, usePromoteFromWaitlist, RegStatus } from "@/hooks/useRegistrations";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const statusStyle: Record<string, string> = {
  registered: "bg-primary/10 text-primary border-0",
  checked_in: "bg-success/10 text-success border-0",
  attended: "bg-success/10 text-success border-0",
  no_show: "bg-muted text-muted-foreground border-0",
  cancelled: "bg-destructive/10 text-destructive border-0",
  waitlisted: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0",
};

const STATUS_OPTIONS: { value: RegStatus; label: string }[] = [
  { value: "registered", label: "Registered" },
  { value: "checked_in", label: "Checked in" },
  { value: "attended", label: "Attended" },
  { value: "no_show", label: "No-show" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "cancelled", label: "Cancelled" },
];

const FILTER_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "registered", label: "Registered" },
  { value: "checked_in", label: "Checked in" },
  { value: "attended", label: "Attended" },
  { value: "no_show", label: "No-show" },
  { value: "waitlisted", label: "Waitlist" },
  { value: "vip", label: "VIP" },
];

type SortColumn = "name" | "email" | "status" | "date";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 15;

export default function EventAttendeesTable({ eventId }: { eventId: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const { data: registrations, isLoading } = useRegistrationsByEvent(eventId);
  const updateReg = useUpdateRegistration();
  const promote = usePromoteFromWaitlist();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, registered: 0, checked_in: 0, attended: 0, no_show: 0, waitlisted: 0, cancelled: 0, vip: 0 };
    registrations?.forEach((r: any) => {
      c.all++;
      c[r.status] = (c[r.status] || 0) + 1;
      if (r.is_vip) c.vip++;
    });
    return c;
  }, [registrations]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortColumn(col); setSortDir("asc"); }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const getValue = (r: any, col: SortColumn): string => {
    const data = r.data as Record<string, string>;
    switch (col) {
      case "name": return (data["Full Name"] || data["Name"] || "").toLowerCase();
      case "email": return (data["Email Address"] || data["Email"] || "").toLowerCase();
      case "status": return r.status;
      case "date": return r.created_at;
    }
  };

  const filtered = useMemo(() => {
    let items = (registrations as any[])?.filter(r => {
      if (filter === "vip") { if (!r.is_vip) return false; }
      else if (filter !== "all" && r.status !== filter) return false;
      if (!search) return true;
      const data = r.data as Record<string, string>;
      return Object.values(data).some(v => typeof v === "string" && v.toLowerCase().includes(search.toLowerCase()));
    }) || [];

    items.sort((a, b) => {
      const va = getValue(a, sortColumn);
      const vb = getValue(b, sortColumn);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return items;
  }, [registrations, search, filter, sortColumn, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleStatusChange = (id: string, status: RegStatus) => {
    const patch: any = { id, status };
    if (status === "checked_in") patch.checked_in_at = new Date().toISOString();
    updateReg.mutate(patch, { onSuccess: () => toast.success("Status updated") });
  };

  const handleVipToggle = (r: any) => {
    updateReg.mutate({ id: r.id, is_vip: !r.is_vip }, {
      onSuccess: () => toast.success(r.is_vip ? "VIP removed" : "Marked as VIP"),
    });
  };

  const handleCheckIn = (id: string) => {
    updateReg.mutate({ id, status: "checked_in", checked_in_at: new Date().toISOString() }, {
      onSuccess: () => toast.success("Checked in"),
    });
  };

  const handlePromote = (id: string) => {
    promote.mutate(id, { onSuccess: () => toast.success("Promoted from waitlist") });
  };

  const handleExportCSV = () => {
    if (!filtered?.length) return;
    const headers = ["Name", "Email", "Status", "VIP", "Checked-in at", "Date"];
    const rows = filtered.map((r: any) => {
      const data = r.data as Record<string, string>;
      return [
        data["Full Name"] || data["Name"] || "",
        data["Email Address"] || data["Email"] || "",
        r.status,
        r.is_vip ? "VIP" : "",
        r.checked_in_at ? format(new Date(r.checked_in_at), "MMM d, yyyy h:mm a") : "",
        format(new Date(r.created_at), "MMM d, yyyy"),
      ];
    });
    const escapeCSV = (val: string): string => {
      const str = String(val ?? "");
      const safe = str.replace(/^([=+\-@])/, "'$1");
      if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) return `"${safe.replace(/"/g, '""')}"`;
      return safe;
    };
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendees.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-lg font-display font-semibold">
          Attendees {filtered.length > 0 && <span className="text-muted-foreground font-normal text-sm">({filtered.length})</span>}
        </h3>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search…" className="pl-9 h-8 text-sm rounded-full" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 rounded-full" onClick={handleExportCSV}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map(chip => {
          const active = filter === chip.value;
          const count = counts[chip.value] || 0;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => { setFilter(chip.value); setPage(0); }}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {chip.label}
              {count > 0 && <span className={cn("ml-1.5 opacity-70")}>{count}</span>}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : paged.length > 0 ? (
        <>
          <div className="rounded-xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                    <span className="flex items-center">Name <SortIcon col="name" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("email")}>
                    <span className="flex items-center">Email <SortIcon col="email" /></span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("date")}>
                    <span className="flex items-center">Date <SortIcon col="date" /></span>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r: any) => {
                  const data = r.data as Record<string, string>;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pr-0">
                        <button
                          type="button"
                          onClick={() => handleVipToggle(r)}
                          aria-label={r.is_vip ? "Remove VIP" : "Mark as VIP"}
                          className="p-1 rounded-full hover:bg-muted"
                        >
                          <Star className={cn("w-4 h-4 transition-colors", r.is_vip ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40")} />
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {data["Full Name"] || data["Name"] || "—"}
                        {r.is_vip && <Badge className="ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-[10px] px-1.5">VIP</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{data["Email Address"] || data["Email"] || "—"}</TableCell>
                      <TableCell>
                        <Select value={r.status} onValueChange={(v) => handleStatusChange(r.id, v as RegStatus)}>
                          <SelectTrigger className={cn("h-7 text-xs rounded-full border-0 px-2.5 w-[130px]", statusStyle[r.status])}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === "waitlisted" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs rounded-full" onClick={() => handlePromote(r.id)}>
                              <ArrowUpFromLine className="w-3 h-3 mr-1" /> Promote
                            </Button>
                          )}
                          {(r.status === "registered" || r.status === "waitlisted") && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs rounded-full" onClick={() => handleCheckIn(r.id)}>
                              <UserCheck className="w-3 h-3 mr-1" /> Check in
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-10 text-muted-foreground text-sm">
          {search || filter !== "all" ? "No matching attendees." : "No registrations yet."}
        </div>
      )}
    </div>
  );
}
