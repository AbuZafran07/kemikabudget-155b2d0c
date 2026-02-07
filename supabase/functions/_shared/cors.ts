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
  
  return defaultOrigins;
};

// Check if origin is from Lovable domains
function isLovableOrigin(origin: string): boolean {
  return origin.endsWith('.lovable.app') || 
         origin.endsWith('.lovableproject.com') ||
         origin.includes('lovable.app') ||
         origin.includes('lovableproject.com');
}

export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  
  // Check if the request origin is allowed
  let origin = allowedOrigins[0]; // Default to first allowed origin
  
  if (requestOrigin) {
    // Check for Lovable domains first (development/preview)
    if (isLovableOrigin(requestOrigin)) {
      origin = requestOrigin;
    } else {
      // Check for exact match in configured origins
      const isAllowed = allowedOrigins.includes(requestOrigin);
      if (isAllowed) {
        origin = requestOrigin;
      }
    }
  }
  
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
