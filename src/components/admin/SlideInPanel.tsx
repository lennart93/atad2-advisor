import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlideInPanelProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export function SlideInPanel({
  open, onClose, title, subtitle, width = 480, children, footer,
}: SlideInPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/20 transition-opacity z-40",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className={cn(
          "fixed right-0 top-0 bottom-0 bg-white border-l border-[#ececec] shadow-[-8px_0_24px_rgba(0,0,0,0.08)] z-50",
          "transition-transform duration-200 ease-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="flex items-start justify-between px-5 py-4 border-b border-[#ececec]">
          <div>
            {subtitle && (
              <div className="text-xs font-semibold text-[#4f46e5] uppercase tracking-wide mb-0.5">
                {subtitle}
              </div>
            )}
            {title && <div className="text-base font-semibold text-foreground">{title}</div>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="border-t border-[#ececec] px-5 py-3">{footer}</footer>
        )}
      </aside>
    </>
  );
}
