import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// TEMPORARY: Runtime fix for cached validation functions  
// This patches any old cached bundles that might still be calling validation during typing
console.warn('🔧 CACHE FIX: Applying runtime patches for validation functions');

// Monkey patch global to catch any cached calls
(window as any).oldValidateExplanation = (window as any).validateExplanation;
(window as any).validateExplanation = (input: string) => {
  console.warn('🔧 CACHE FIX: validateExplanation intercepted and returning unchanged input');
  return input;
};

createRoot(document.getElementById("root")!).render(<App />);
