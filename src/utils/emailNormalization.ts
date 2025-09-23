// Email normalization utility for progressive login flow

/**
 * Normalizes a name string for use in email generation
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[''`",\/()]/g, '')                      // drop punctuation
    .replace(/\s+/g, '')                               // remove spaces
    .replace(/[^a-z0-9.-]/g, '')                        // allow only a-z 0-9 . -
    .replace(/[.-]{2,}/g, m => m[0])                    // collapse repeats
    .replace(/^[.-]+|[.-]+$/g, '');                     // trim ends
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