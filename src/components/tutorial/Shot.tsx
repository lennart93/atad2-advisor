import { AppFrame } from "./AppFrame";

interface ShotProps {
  /** Path under `public/` — e.g. "/tutorial/screens/02-dashboard.png". */
  src: string;
  /** Fake URL shown in the frame's address bar. */
  url?: string;
  /** Alt text for accessibility. */
  alt: string;
}

/**
 * Real screenshot of the app, framed in a browser-like chrome.
 * Used as the hero visual for every tutorial chapter.
 */
export function Shot({ src, url = "app.atad2.tax", alt }: ShotProps) {
  return (
    <AppFrame url={url} contentClassName="bg-background">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        className="block w-full h-auto select-none"
      />
    </AppFrame>
  );
}
