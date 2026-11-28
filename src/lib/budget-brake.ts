// Helper "Rem Budget" — logika tampilan; aturan sebenarnya ada di database (0007_budget_release_brake).

export type ReleaseMode = "none" | "sales" | "manual";

export interface ReleaseTier {
  min_pct: number;
  release_pct: number;
}

export const DEFAULT_TIERS: ReleaseTier[] = [
  { min_pct: 85, release_pct: 40 },
  { min_pct: 90, release_pct: 75 },
  { min_pct: 100, release_pct: 100 },
];

export const RELEASE_MODE_LABEL: Record<ReleaseMode, string> = {
  none: "Tanpa rem",
  sales: "Ikut pencapaian penjualan",
  manual: "Manual (Super Admin)",
};

export const RELEASE_EVENT_LABEL: Record<string, string> = {
  plan: "Atur rencana",
  auto: "Buka otomatis",
  manual: "Buka manual",
  transfer_in: "Transfer masuk",
  transfer_out: "Transfer keluar",
};

export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatRp(value: number | null | undefined): string {
  return "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}

export function parseTiers(raw: unknown): ReleaseTier[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TIERS];
  return raw
    .map((t) => ({ min_pct: Number((t as ReleaseTier)?.min_pct), release_pct: Number((t as ReleaseTier)?.release_pct) }))
    .filter((t) => Number.isFinite(t.min_pct) && Number.isFinite(t.release_pct))
    .sort((a, b) => a.min_pct - b.min_pct);
}

/** Sama dengan validate_budget_release_settings di database. Mengembalikan pesan error atau null. */
export function validateTiers(tiers: ReleaseTier[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.min_pct - b.min_pct);
  let prevMin = -1;
  let prevRel = -1;
  for (const t of sorted) {
    if (!Number.isFinite(t.min_pct) || !Number.isFinite(t.release_pct)) return "Isi semua angka tingkat pembukaan";
    if (t.min_pct < 0 || t.min_pct > 1000) return "Pencapaian minimal harus 0–1000%";
    if (t.release_pct < 0 || t.release_pct > 100) return "Persentase dibuka harus 0–100%";
    if (t.min_pct === prevMin) return "Pencapaian minimal tidak boleh sama";
    if (t.release_pct < prevRel) return "Persentase dibuka harus naik mengikuti pencapaian";
    prevMin = t.min_pct;
    prevRel = t.release_pct;
  }
  return null;
}

/** Persentase dana ditahan yang dibuka untuk pencapaian tertentu (sama dengan budget_release_tier_pct). */
export function tierReleasePct(tiers: ReleaseTier[], achievementPct: number | null | undefined): number {
  if (achievementPct === null || achievementPct === undefined || !Number.isFinite(achievementPct)) return 0;
  let pct = 0;
  for (const t of [...tiers].sort((a, b) => a.min_pct - b.min_pct)) {
    if (achievementPct >= t.min_pct) pct = t.release_pct;
  }
  return pct;
}

/** Tingkat berikutnya yang membuka dana lebih banyak, atau null. */
export function nextTier(tiers: ReleaseTier[], achievementPct: number | null | undefined): ReleaseTier | null {
  const current = tierReleasePct(tiers, achievementPct);
  const sorted = [...tiers].sort((a, b) => a.min_pct - b.min_pct);
  return sorted.find((t) => t.release_pct > current && (achievementPct == null || t.min_pct > achievementPct)) ?? null;
}

/** Plafon terbuka menurut pencapaian (sama dengan budget_line_sales_target). */
export function salesReleaseTarget(allocated: number, initial: number, releasePct: number): number {
  const held = Math.max(allocated - initial, 0);
  return Math.min(allocated, initial + Math.floor((held * releasePct) / 100));
}

/** Tingkat terendah dengan persentase dibuka > 0 (bawah ini dana ditahan tidak bisa dikeluarkan). */
export function lowestReleasingTier(tiers: ReleaseTier[]): ReleaseTier | null {
  return [...tiers].sort((a, b) => a.min_pct - b.min_pct).find((t) => t.release_pct > 0) ?? null;
}

export function describeTiers(tiers: ReleaseTier[]): string[] {
  const sorted = [...tiers].sort((a, b) => a.min_pct - b.min_pct);
  const lines: string[] = [];
  const first = lowestReleasingTier(sorted);
  if (first) lines.push(`< ${first.min_pct}%: dana ditahan belum bisa dikeluarkan`);
  sorted.forEach((t, i) => {
    const next = sorted[i + 1];
    const range = next ? `${t.min_pct}% – < ${next.min_pct}%` : `≥ ${t.min_pct}%`;
    lines.push(`${range}: dibuka ${t.release_pct}% dari dana ditahan`);
  });
  return lines;
}
