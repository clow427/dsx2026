import { Users, TrendingUp, CalendarDays, Loader2 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useRegistrationStats } from "@/hooks/useRegistrations";
import { useMemo } from "react";
import { format, parseISO, startOfWeek } from "date-fns";

const Analytics = () => {
  const { data: stats, isLoading } = useRegistrationStats();

  const perEventData = useMemo(() => {
    if (!stats?.events || !stats?.registrations) return [];
    const countMap: Record<string, { name: string; registrations: number }> = {};
    stats.events.forEach(e => { countMap[e.id] = { name: e.name, registrations: 0 }; });
    stats.registrations.forEach(r => {
      if (countMap[r.event_id]) countMap[r.event_id].registrations++;
    });
    return Object.values(countMap)
      .filter(d => d.registrations > 0)
      .sort((a, b) => b.registrations - a.registrations);
  }, [stats]);

  const overTimeData = useMemo(() => {
    if (!stats?.registrations?.length) return [];
    const weekMap: Record<string, number> = {};
    stats.registrations.forEach(r => {
      const week = format(startOfWeek(parseISO(r.created_at)), "MMM d");
      weekMap[week] = (weekMap[week] || 0) + 1;
    });
    return Object.entries(weekMap).map(([week, count]) => ({ week, registrations: count }));
  }, [stats]);

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const statCards = [
    { label: "Total registrations", value: stats?.total ?? 0, icon: Users },
    { label: "Active events", value: stats?.activeEvents ?? 0, icon: CalendarDays },
    { label: "Avg per event", value: stats?.events?.length ? Math.round((stats?.total ?? 0) / stats.events.length) : 0, icon: TrendingUp },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Analytics</h1>
        <p className="text-muted-foreground">Track your event performance and registration metrics.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                <stat.icon className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-2xl font-display font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card rounded-xl p-5 sm:p-6">
          <h3 className="font-display font-semibold mb-4">Registrations by event</h3>
          {perEventData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perEventData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" className="text-xs" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13 }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="registrations" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-12 text-sm">No registration data yet.</p>
          )}
        </div>

        <div className="bg-card rounded-xl p-5 sm:p-6">
          <h3 className="font-display font-semibold mb-4">Registrations over time</h3>
          {overTimeData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overTimeData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13 }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Line type="monotone" dataKey="registrations" stroke="hsl(var(--success))" strokeWidth={2.5} dot={{ fill: "hsl(var(--success))", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-12 text-sm">No registration data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
