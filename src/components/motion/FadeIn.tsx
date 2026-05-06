import { motion, type HTMLMotionProps } from "framer-motion";

interface Props extends HTMLMotionProps<"div"> {
  delay?: number;
  y?: number;
  duration?: number;
}

export function FadeIn({ delay = 0, y = 8, duration = 0.32, children, ...rest }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: [0.2, 0, 0, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
