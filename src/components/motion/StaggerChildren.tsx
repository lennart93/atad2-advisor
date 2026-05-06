import { motion, type HTMLMotionProps } from "framer-motion";

interface Props extends HTMLMotionProps<"div"> {
  stagger?: number;
  delayChildren?: number;
}

export function StaggerChildren({ stagger = 0.05, delayChildren = 0, children, ...rest }: Props) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: stagger, delayChildren },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.2, 0, 0, 1] as const } },
};
