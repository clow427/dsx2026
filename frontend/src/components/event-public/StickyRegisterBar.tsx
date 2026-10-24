import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";

interface Props {
  brandColor: string;
  eventName: string;
  onRegisterClick: () => void;
}

/**
 * Sticky bottom (mobile) / top (desktop) register bar that springs in once the
 * hero scrolls out of view. Includes safe-area padding for iOS.
 */
export function StickyRegisterBar({ brandColor, eventName, onRegisterClick }: Props) {
  const [show, setShow] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => {
    setShow(v > 480);
  });

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="sticky-register"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="fixed bottom-0 left-0 right-0 z-40 px-3 sm:px-6 pb-3 sm:pb-5"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div
            className="max-w-3xl mx-auto flex items-center gap-3 p-2 pl-4 sm:pl-6 rounded-full backdrop-blur-2xl border-0 shadow-2xl"
            style={{
              background: "hsl(var(--background) / 0.85)",
              boxShadow: "0 20px 60px -20px rgba(0,0,0,0.35)",
            }}
          >
            <span className="hidden sm:block text-sm font-medium truncate flex-1 text-foreground">
              {eventName}
            </span>
            <button
              type="button"
              onClick={onRegisterClick}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 h-11 sm:h-12 px-6 sm:px-7 rounded-full text-sm sm:text-base font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.99]"
              style={{
                background: `linear-gradient(135deg, ${brandColor}, hsl(265 90% 62%))`,
                boxShadow: `0 12px 30px -8px ${brandColor}88`,
              }}
            >
              Register
              <span>→</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
