import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ds-page">
      <div className="text-center">
        <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary mb-2">Error 404</p>
        <h1 className="text-3xl font-normal tracking-tight tabular-nums mb-3">404</h1>
        <p className="text-base text-ds-ink-secondary mb-5">This page does not exist. The link may be outdated or the address mistyped.</p>
        <a href="/" className="text-ds-ink underline hover:text-ds-ink-secondary">
          Return to home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
