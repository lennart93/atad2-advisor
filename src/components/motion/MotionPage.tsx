import { motion, type HTMLMotionProps } from "framer-motion";

interface Props extends HTMLMotionProps<"div"> {
  variant?: "fade" | "slide";
}

export function MotionPage({ variant = "fade", children, ...rest }: Props) {
  const initial = variant === "slide" ? { opacity: 0, x: 16 } : { opacity: 0, y: 8 };
  return (
    <motion.div
      initial={initial}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
