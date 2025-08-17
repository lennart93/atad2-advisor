/**
 * Input validation and sanitization utilities for security
 */

// HTML sanitization function
export const sanitizeHtml = (input: string): string => {
  if (!input) return '';
  
  // Remove script tags and their content
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove dangerous attributes
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, ''); // onclick, onload, etc.
  sanitized = sanitized.replace(/\s*javascript\s*:/gi, ''); // javascript: urls
  sanitized = sanitized.replace(/\s*data\s*:/gi, ''); // data: urls
  sanitized = sanitized.replace(/\s*vbscript\s*:/gi, ''); // vbscript: urls
  
  // Remove form and input tags
  sanitized = sanitized.replace(/<\s*(form|input|textarea|select|option)\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/<\/\s*(form|input|textarea|select|option)\s*>/gi, '');
  
  return sanitized.trim();
};

// Text input validation and length limits
export const validateTextInput = (input: string, maxLength: number = 1000): string => {
  if (!input) return '';
  
  // Remove null bytes and control characters except newlines and tabs
  let cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }
  
  return cleaned.trim();
};

// Taxpayer name validation (no HTML, reasonable length)
export const validateTaxpayerName = (name: string): string => {
  if (!name) throw new Error('Naam van belastingplichtige is verplicht');
  
  const cleaned = validateTextInput(name, 100);
  
  // Only allow letters, numbers, spaces, hyphens, and common punctuation
  const validated = cleaned.replace(/[^a-zA-Z0-9\s\-\.,&()]/g, '');
  
  if (validated.length < 2) {
    throw new Error('Naam moet minimaal 2 karakters bevatten');
  }
  
  return validated;
};

// Entity name validation
export const validateEntityName = (name: string): string => {
  if (!name) return '';
  
  const cleaned = validateTextInput(name, 100);
  const validated = cleaned.replace(/[^a-zA-Z0-9\s\-\.,&()]/g, '');
  
  return validated;
};

// Explanation text validation (allows more characters but sanitizes HTML)
export const validateExplanation = (explanation: string): string => {
  if (!explanation) return '';
  
  const cleaned = validateTextInput(explanation, 5000);
  const sanitized = sanitizeHtml(cleaned);
  
  return sanitized;
};

// Session ID validation
export const validateSessionId = (sessionId: string): string => {
  if (!sessionId) throw new Error('Session ID is verplicht');
  
  // Only allow alphanumeric characters and hyphens
  const validated = sessionId.replace(/[^a-zA-Z0-9\-]/g, '');
  
  if (validated.length < 10) {
    throw new Error('Ongeldige session ID');
  }
  
  return validated;
};

// Question ID validation
export const validateQuestionId = (questionId: string): string => {
  if (!questionId) throw new Error('Question ID is verplicht');
  
  // Only allow alphanumeric characters
  const validated = questionId.replace(/[^a-zA-Z0-9]/g, '');
  
  if (validated.length === 0) {
    throw new Error('Ongeldige question ID');
  }
  
  return validated;
};

// Email validation (basic)
export const validateEmail = (email: string): string => {
  if (!email) throw new Error('Email is verplicht');
  
  const cleaned = validateTextInput(email, 254);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(cleaned)) {
    throw new Error('Ongeldig email adres');
  }
  
  return cleaned.toLowerCase();
};

// Risk points validation
export const validateRiskPoints = (points: number): number => {
  if (typeof points !== 'number' || isNaN(points)) {
    return 0;
  }
  
  // Ensure risk points are within reasonable bounds and round to 1 decimal place
  const bounded = Math.max(0, Math.min(100, points));
  return Math.round(bounded * 10) / 10;
};

// Date validation
export const validateDate = (dateString: string): Date => {
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    throw new Error('Ongeldige datum');
  }
  
  // Check if date is not too far in the past or future
  const now = new Date();
  const minDate = new Date(now.getFullYear() - 10, 0, 1);
  const maxDate = new Date(now.getFullYear() + 5, 11, 31);
  
  if (date < minDate || date > maxDate) {
    throw new Error('Datum moet tussen 2014 en 2030 liggen');
  }
  
  return date;
};