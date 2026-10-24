import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

/** Custom on-brand "enhance" icon: a tilted magic wand with a trailing spark. */
export function MagicWandIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* wand body */}
      <path
        d="M5 19L15.5 8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* wand tip gem */}
      <path
        d="M16.8 5.2L18 4l1.2 1.2L20.4 4l-1.2 1.2L20.4 6.4 19.2 7.6 18 6.4 16.8 7.6 18 6.4z"
        fill="currentColor"
        opacity="0.9"
      />
      <circle cx="18" cy="6" r="1.6" fill="currentColor" />
      {/* trailing sparkles */}
      <path
        d="M7 6.5l.6 1.4L9 8.5l-1.4.6L7 10.5l-.6-1.4L5 8.5l1.4-.6z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M14 17l.4 1L15.5 18.5l-1.1.5L14 20l-.4-1L12.5 18.5l1.1-.5z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}
