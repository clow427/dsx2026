import type { EventModule } from "@/hooks/useEventModules";
import { PublicModule } from "@/components/event-public/PublicModule";

interface Props {
  modules: EventModule[];
  brandColor?: string;
  compact?: boolean;
  editable?: boolean;
  seedKey?: string;
  onRegenerateTransition?: (moduleId: string, next: any) => void;
}

/**
 * Dashboard-side renderer. Delegates to the same per-module components used on
 * the public event page so previews always match the live page.
 */
export default function EventModuleRenderer({
  modules,
  brandColor = "#7C3AED",
}: Props) {
  const visible = modules.filter((m) => m.enabled).sort((a, b) => a.position - b.position);
  if (visible.length === 0) return null;

  return (
    <div className="w-full">
      {visible.map((m, i) => (
        <PublicModule key={m.id} module={m} brandColor={brandColor} index={i} />
      ))}
    </div>
  );
}
