// Email normalization utility for progressive login flow

/**
 * Character mapping for special characters that don't get handled by NFD normalization
 */
const characterMap: Record<string, string> = {
  'æ': 'ae', 'ø': 'o', 'å': 'a', 'đ': 'd', 'ð': 'd', 'þ': 'th',
  'ß': 'ss', 'ĳ': 'ij', 'œ': 'oe', 'ł': 'l', 'ŋ': 'ng', 'ħ': 'h',
  'ı': 'i', 'ĸ': 'k', 'ſ': 's', 'ŧ': 't', 'ź': 'z', 'ż': 'z'
};

/**
 * Normalizes a name string for use in email generation
 * Converts special characters to ASCII equivalents and removes diacritics
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    // Apply custom character mappings first for edge cases
    .replace(/[æøåđðþßĳœłŋħıĸſŧźż]/g, char => characterMap[char] || char)
    // Unicode normalization to decompose characters and remove diacritics
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
    // Remove punctuation and special characters
    .replace(/[''`",\/()]/g, '')                      
    // Remove spaces
    .replace(/\s+/g, '')                               
    // Allow only alphanumeric, dots, and hyphens
    .replace(/[^a-z0-9.-]/g, '')                        
    // Collapse repeated dots or hyphens
    .replace(/[.-]{2,}/g, m => m[0])                    
    // Remove leading/trailing dots or hyphens
    .replace(/^[.-]+|[.-]+$/g, '');                     
}

/**
 * Generates email local part from first and last name
 */
export function makeLocalPart(firstName: string, lastName: string): string {
  const normalizedFirst = normalizeName(firstName);
  const normalizedLast = normalizeName(lastName);
  
  if (!normalizedFirst || !normalizedLast) {
    throw new Error('Both first and last name required after normalization');
  }
  
  const localPart = `${normalizedFirst}.${normalizedLast}`;
  
  // Ensure length is within limits (1-64 chars)
  if (localPart.length > 64) {
    throw new Error('Generated email is too long');
  }
  
  return localPart;
}

/**
 * Validates a local part for email
 */
export function validateLocalPart(localPart: string): { valid: boolean; error?: string } {
  if (!localPart) {
    return { valid: false, error: 'Email is required' };
  }
  
  if (localPart.length > 64) {
    return { valid: false, error: 'Email is too long' };
  }
  
  const regex = /^[a-z0-9]+([.-][a-z0-9]+)*$/;
  if (!regex.test(localPart)) {
    return { valid: false, error: 'Use letters, numbers, dots, and hyphens only' };
  }
  
  return { valid: true };
}

/**
 * Validates a name string
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'Name is required' };
  }
  
  if (trimmed.length > 64) {
    return { valid: false, error: 'Name is too long' };
  }
  
  // Allow letters, spaces, hyphens, apostrophes
  const regex = /^[a-zA-ZÀ-ÿ\s'-]+$/;
  if (!regex.test(trimmed)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }
  
  return { valid: true };
}