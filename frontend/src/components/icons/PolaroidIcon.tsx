import { SVGProps } from "react";

/**
 * Stack of polaroid photos — used for AI image generation entry points.
 */
export const PolaroidIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    {/* back polaroid (rotated) */}
    <g transform="rotate(-12 8 13)">
      <rect x="3.2" y="6.5" width="10" height="12" rx="1.2" fill="currentColor" opacity="0.18" stroke="none" />
      <rect x="3.2" y="6.5" width="10" height="12" rx="1.2" />
      <rect x="4.4" y="7.7" width="7.6" height="7.2" rx="0.6" />
    </g>
    {/* front polaroid */}
    <g transform="rotate(8 15 12)">
      <rect x="9.5" y="4.5" width="11" height="13" rx="1.3" fill="currentColor" opacity="0.08" stroke="none" />
      <rect x="9.5" y="4.5" width="11" height="13" rx="1.3" />
      <rect x="10.8" y="5.8" width="8.4" height="7.6" rx="0.6" />
      {/* tiny sparkle to hint AI */}
      <path d="M17.6 15.6l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z" fill="currentColor" stroke="none" />
    </g>
  </svg>
);

export default PolaroidIcon;
