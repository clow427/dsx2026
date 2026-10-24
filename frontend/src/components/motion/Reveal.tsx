import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "framer-motion";
import { type ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

interface RevealProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
  x?: number;
  direction?: Direction;
  once?: boolean;
  amount?: number;
}

const offset = (dir: Direction, mag: number) => {
  switch (dir) {
    case "up": return { y: mag };
    case "down": return { y: -mag };
    case "left": return { x: mag };
    case "right": return { x: -mag };
    default: return {};
  }
};

export function Reveal({
  children,
  delay = 0,
  duration = 0.7,
  y,
  x,
  direction = "up",
  once = true,
  amount = 0.2,
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  const off = x !== undefined || y !== undefined ? { x: x ?? 0, y: y ?? 0 } : offset(direction, 24);

  if (reduce) return <div {...(rest as any)}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, ...off }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export function StaggerGroup({
  children,
  className,
  amount = 0.2,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}
