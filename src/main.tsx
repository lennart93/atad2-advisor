import * as React from 'react';
import * as React2 from 'react';
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ✅ RUNTIME ASSERT - DETECT DUPLICATE REACT INSTANTLY
if (import.meta && import.meta.env && import.meta.env.DEV) {
  // Sanity: same object?
  if (React !== React2) {
    console.error('🚨 Multiple React instances detected (React !== React2).');
  }
  // Global singleton probe
  // @ts-ignore
  if (typeof window !== 'undefined') {
    // @ts-ignore
    if ((window as any).__react_singleton__ && (window as any).__react_singleton__ !== React) {
      console.error('🚨 Multiple React copies (window.__react_singleton__ differs).');
    }
    // @ts-ignore
    (window as any).__react_singleton__ = React;
  }
}

createRoot(document.getElementById("root")!).render(<App />);