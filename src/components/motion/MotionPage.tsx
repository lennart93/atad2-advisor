import { motion, type HTMLMotionProps } from "framer-motion";

interface Props extends HTMLMotionProps<"div"> {
  variant?: "fade" | "slide";
  /** Render as a <main> landmark for standalone pages that have no AppLayout <main>. */
  as?: "div" | "main";
}

export function MotionPage({ variant = "fade", as = "div", children, ...rest }: Props) {
  const initial = variant === "slide" ? { opacity: 0, x: 16 } : { opacity: 0, y: 8 };
  const Comp = as === "main" ? motion.main : motion.div;
  return (
    <Comp
      initial={initial}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
