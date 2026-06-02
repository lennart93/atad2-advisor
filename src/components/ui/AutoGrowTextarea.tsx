import { useLayoutEffect, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";

type AutoGrowTextareaProps = React.ComponentProps<typeof Textarea> & {
  // Cap relative to viewport so the textarea never pushes the
  // Previous/Continue action bar off-screen. Beyond the cap, the
  // textarea scrolls internally.
  maxHeightVh?: number;
};

export function AutoGrowTextarea({
  value,
  maxHeightVh = 60,
  ...rest
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = (window.innerHeight * maxHeightVh) / 100;
    const next = Math.min(el.scrollHeight, cap);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  };

  useLayoutEffect(() => {
    resize();
  }, [value, maxHeightVh]);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return <Textarea ref={ref} value={value} {...rest} />;
}
