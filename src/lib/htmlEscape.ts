/**
 * HTML escape utility for preventing XSS in dynamically generated HTML
 * Used in PDF generation and any other HTML template rendering
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param unsafe - The potentially unsafe string to escape
 * @returns HTML-safe string with special characters escaped
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) {
    return '-';
  }
  
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Escapes HTML but preserves empty string as empty (not '-')
 * Useful for optional fields where '-' should only be shown explicitly
 */
export function escapeHtmlOptional(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined || unsafe === '') {
    return '';
  }
  
  return escapeHtml(unsafe);
}

/**
 * Escapes HTML and returns a default value if the input is empty
 * @param unsafe - The potentially unsafe string to escape
 * @param defaultValue - The value to return if input is null/undefined/empty
 */
export function escapeHtmlWithDefault(
  unsafe: string | null | undefined, 
  defaultValue: string = '-'
): string {
  if (unsafe === null || unsafe === undefined || unsafe === '') {
    return escapeHtml(defaultValue);
  }
  
  return escapeHtml(unsafe);
}
