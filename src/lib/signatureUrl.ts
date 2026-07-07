import { supabase } from "@/integrations/supabase/client";

/**
 * The 'signatures' bucket is private. Signatures are always stored at
 * `${userId}/signature.png`. Given a user id and a truthy stored value
 * (any non-null profiles.signature_url), return a short-lived signed URL,
 * or null on failure / when there is no signature.
 */
export async function resolveSignatureUrl(
  userId: string | null | undefined,
  hasSignature: unknown,
): Promise<string | null> {
  if (!userId || !hasSignature) return null;
  const path = `${userId}/signature.png`;
  try {
    const { data, error } = await supabase.storage
      .from("signatures")
      .createSignedUrl(path, 60 * 60); // 1 hour
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
