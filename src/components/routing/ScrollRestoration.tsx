import { useEffect, useRef, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "scroll-positions";

function getPositions(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setPositions(positions: Record<string, number>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {}
}

const ScrollRestoration = () => {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);

  // Save previous path scroll on route change
  useEffect(() => {
    const prevPath = prevPathRef.current;
    const positions = getPositions();
    positions[prevPath] = window.scrollY;
    setPositions(positions);
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  // Restore scroll for current path immediately after paint
  useLayoutEffect(() => {
    const positions = getPositions();
    const y = positions[location.pathname] ?? 0;
    if (typeof y === "number") {
      // Use rAF to ensure layout is ready
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
    }
  }, [location.pathname]);

  // Persist on tab hide/unload
  useEffect(() => {
    const onHide = () => {
      const positions = getPositions();
      positions[location.pathname] = window.scrollY;
      setPositions(positions);
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    return () => {
      window.removeEventListener("beforeunload", onHide);
    };
  }, [location.pathname]);

  return null;
};

export default ScrollRestoration;
