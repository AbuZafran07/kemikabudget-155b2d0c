// Shared CORS configuration for all edge functions
// Uses environment variable APP_ORIGIN for production, falls back to localhost for development

const getAllowedOrigins = (): string[] => {
  const appOrigin = Deno.env.get('APP_ORIGIN');
  
  // Default allowed origins for development
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];
  
  if (appOrigin) {
    // In production, use the configured origin
    return [appOrigin, ...defaultOrigins];
  }
  
  // In development, also allow Lovable preview domains
  return [
    ...defaultOrigins,
    'https://*.lovable.app',
    'https://*.lovableproject.com',
  ];
};

export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  
  // Check if the request origin is allowed
  let origin = allowedOrigins[0]; // Default to first allowed origin
  
  if (requestOrigin) {
    // Check for exact match or wildcard match
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Handle wildcard patterns like https://*.lovable.app
        const regex = new RegExp('^' + allowed.replace(/\*/g, '.*') + '$');
        return regex.test(requestOrigin);
      }
      return allowed === requestOrigin;
    });
    
    if (isAllowed) {
      origin = requestOrigin;
    }
  }
  
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// UUID validation helper
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

// Email validation helper
export function isValidEmail(email: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

// Text sanitization - removes potentially dangerous characters
export function sanitizeText(text: string, maxLength: number = 1000): string {
  if (!text) return '';
  
  // Trim and limit length
  let sanitized = text.trim().substring(0, maxLength);
  
  // Remove potential XSS vectors
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  return sanitized;
}
