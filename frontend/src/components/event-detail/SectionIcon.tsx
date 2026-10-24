import { motion } from "framer-motion";
import type { ModuleType } from "@/hooks/useEventModules";

/**
 * Hand-crafted, animated SVG icons for landing page sections.
 * No generic Lucide pictograms — each one is a small premium illustration.
 */

interface IconProps {
  color: string;
  size?: number;
  animated?: boolean;
}

const float = (delay = 0) => ({
  animate: { y: [0, -3, 0] },
  transition: { duration: 3.4, repeat: Infinity, ease: "easeInOut" as const, delay },
});

const spin = (delay = 0) => ({
  animate: { rotate: [0, 360] },
  transition: { duration: 18, repeat: Infinity, ease: "linear" as const, delay },
});

function WhyAttendIcon({ color, size = 28, animated }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <motion.circle cx="16" cy="16" r="11" stroke={color} strokeWidth="1.6" strokeOpacity="0.25" {...(animated ? spin() : {})} style={{ transformOrigin: "16px 16px" }} strokeDasharray="3 4" />
      <motion.path d="M16 6.5 L18.6 13.4 L26 14 L20.3 18.7 L22 26 L16 21.9 L10 26 L11.7 18.7 L6 14 L13.4 13.4 Z" fill={color} {...(animated ? float() : {})} />
    </svg>
  );
}

function ScheduleIcon({ color, size = 28, animated }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="8" width="22" height="18" rx="3" fill={color} fillOpacity="0.12" />
      <rect x="5" y="8" width="22" height="5" rx="2.5" fill={color} />
      <motion.line x1="10" y1="5" x2="10" y2="11" stroke={color} strokeWidth="2" strokeLinecap="round" {...(animated ? float(0) : {})} />
      <motion.line x1="22" y1="5" x2="22" y2="11" stroke={color} strokeWidth="2" strokeLinecap="round" {...(animated ? float(0.4) : {})} />
      <circle cx="11" cy="18" r="1.3" fill={color} />
      <circle cx="16" cy="18" r="1.3" fill={color} fillOpacity="0.5" />
      <circle cx="21" cy="18" r="1.3" fill={color} fillOpacity="0.3" />
      <motion.circle cx="11" cy="22.5" r="1.3" fill={color} {...(animated ? { animate: { opacity: [0.4, 1, 0.4] }, transition: { duration: 2.2, repeat: Infinity } } : {})} />
    </svg>
  );
}

function SpeakersIcon({ color, size = 28, animated }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <motion.g {...(animated ? float() : {})}>
        <circle cx="11" cy="13" r="4" fill={color} />
        <path d="M4 26c0-4 3.1-7 7-7s7 3 7 7" fill={color} fillOpacity="0.35" />
      </motion.g>
      <motion.g {...(animated ? float(0.6) : {})}>
        <circle cx="22" cy="11" r="3.2" fill={color} fillOpacity="0.7" />
        <path d="M16 24c0-3.3 2.7-6 6-6s6 2.7 6 6" fill={color} fillOpacity="0.25" />
      </motion.g>
    </svg>
  );
}

function LocationIcon({ color, size = 28, animated }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <motion.path d="M16 4c-5 0-9 3.8-9 8.7 0 6.5 9 15.3 9 15.3s9-8.8 9-15.3C25 7.8 21 4 16 4Z" fill={color} {...(animated ? float() : {})} />
      <circle cx="16" cy="13" r="3.4" fill="white" />
      <motion.ellipse cx="16" cy="29" rx="6" ry="1.2" fill={color} fillOpacity="0.18" {...(animated ? { animate: { scaleX: [1, 0.7, 1], opacity: [0.18, 0.08, 0.18] }, transition: { duration: 3.4, repeat: Infinity } } : {})} style={{ transformOrigin: "16px 29px" }} />
    </svg>
  );
}

function FaqIcon({ color, size = 28, animated }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <motion.path
        d="M9 6h11a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5h-4l-5 4v-4H9a5 5 0 0 1-5-5v-6a5 5 0 0 1 5-5Z"
        fill={color}
        {...(animated ? float() : {})}
      />
      <text x="14.5" y="19" fontFamily="Bricolage Grotesque, sans-serif" fontSize="11" fontWeight="700" fill="white">?</text>
    </svg>
  );
}

function SponsorsIcon({ color, size = 28, animated }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <motion.path d="M16 3l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6L16 20.5 9.2 24l1.3-7.6L5 11l7.6-1.1L16 3Z" fill={color} {...(animated ? { animate: { rotate: [0, 8, -8, 0] }, transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const } } : {})} style={{ transformOrigin: "16px 16px" }} />
      <path d="M11 23l-2 6 4-2 3 2-2-6" fill={color} fillOpacity="0.7" />
      <path d="M21 23l2 6-4-2-3 2 2-6" fill={color} fillOpacity="0.55" />
    </svg>
  );
}

function CustomIcon({ color, size = 28, animated }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <motion.rect x="6" y="6" width="14" height="18" rx="2.5" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.4" {...(animated ? float() : {})} />
      <motion.rect x="12" y="10" width="14" height="18" rx="2.5" fill={color} {...(animated ? float(0.5) : {})} />
      <line x1="15" y1="15" x2="22" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="19" x2="22" y2="19" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />
      <line x1="15" y1="23" x2="19" y2="23" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

const MAP: Record<ModuleType, React.FC<IconProps>> = {
  why_attend: WhyAttendIcon,
  schedule: ScheduleIcon,
  speakers: SpeakersIcon,
  location: LocationIcon,
  faq: FaqIcon,
  sponsors: SponsorsIcon,
  custom: CustomIcon,
};

export default function SectionIcon({ type, color, size, animated = true }: { type: ModuleType; color: string; size?: number; animated?: boolean }) {
  const Cmp = MAP[type] || CustomIcon;
  return <Cmp color={color} size={size} animated={animated} />;
}
