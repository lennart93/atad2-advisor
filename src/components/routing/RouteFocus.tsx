import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Moves keyboard/screen-reader focus to the page's <main> landmark after a
 * client-side route change, so navigation lands assistive tech at the new
 * content instead of leaving focus on the link that was just clicked (or
 * losing it entirely when that link unmounts). Skips the initial load and
 * never scrolls: ScrollRestoration owns the scroll position.
 */
const RouteFocus = () => {
  const location = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const main = document.getElementById("main-content");
    if (main instanceof HTMLElement) {
      main.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  return null;
};

export default RouteFocus;
