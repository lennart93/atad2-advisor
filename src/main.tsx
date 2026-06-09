import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import App from './App.tsx'
import './index.css'
import 'flag-icons/css/flag-icons.min.css'

// TEMPORARY: Runtime fix for cached validation functions
// This patches any old cached bundles that might still be calling validation during typing
console.warn('🔧 CACHE FIX: Applying runtime patches for validation functions');

(window as any).oldValidateExplanation = (window as any).validateExplanation;
(window as any).validateExplanation = (input: string) => {
  console.warn('🔧 CACHE FIX: validateExplanation intercepted and returning unchanged input');
  return input;
};

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <App />
  </ThemeProvider>
);
