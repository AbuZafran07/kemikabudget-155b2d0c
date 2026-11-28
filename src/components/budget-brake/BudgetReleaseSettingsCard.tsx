import { useEffect, useState } from "react";
import { Gauge, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBudgetReleaseSettings, useUpdateBudgetReleaseSettings } from "@/hooks/useBudgetBrake";
import { DEFAULT_TIERS, describeTiers, validateTiers, type ReleaseTier } from "@/lib/budget-brake";

/** Pengaturan tingkat pembukaan Rem Budget. Hanya Super Admin yang dapat mengubah. */
export const BudgetReleaseSettingsCard = () => {
  const { hasRoleExact } = useAuth();
  const canEdit = hasRoleExact("super_admin");
  const { data, isLoading, error } = useBudgetReleaseSettings();
  const update = useUpdateBudgetReleaseSettings();
  const [tiers, setTiers] = useState<ReleaseTier[]>(DEFAULT_TIERS);
  const [autoEnabled, setAutoEnabled] = useState(true);

  useEffect(() => {
    if (data) {
      setTiers(data.tiers.length ? data.tiers : DEFAULT_TIERS);
      setAutoEnabled(data.auto_release_enabled);
    }
  }, [data]);

  const validation = validateTiers(tiers);
  const changed =
    !!data && (JSON.stringify(tiers) !== JSON.stringify(data.tiers) || autoEnabled !== data.auto_release_enabled);

  const setTier = (idx: number, key: keyof ReleaseTier, value: string) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, [key]: value === "" ? NaN : Number(value) } : t)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Rem Budget — Tingkat Pembukaan Dana
        </CardTitle>
        <CardDescription>
          Dana pos yang ditahan dibuka otomatis sesuai pencapaian penjualan total perusahaan (realisasi invoice vs target,
          kumulatif sampai bulan terakhir yang sudah lewat). Berlaku untuk pos bermode "Ikut pencapaian penjualan".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Gagal memuat pengaturan: {(error as Error).message}</p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Buka otomatis</Label>
                <p className="text-xs text-muted-foreground">
                  Bila dimatikan, dana ditahan hanya bisa dibuka manual oleh Super Admin.
                </p>
              </div>
              <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} disabled={!canEdit} />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
                <span>Pencapaian minimal (%)</span>
                <span>Dibuka dari dana ditahan (%)</span>
                <span />
              </div>
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input type="number" min={0} max={1000} step="0.1" value={Number.isNaN(t.min_pct) ? "" : t.min_pct}
                    onChange={(e) => setTier(i, "min_pct", e.target.value)} disabled={!canEdit} />
                  <Input type="number" min={0} max={100} step="1" value={Number.isNaN(t.release_pct) ? "" : t.release_pct}
                    onChange={(e) => setTier(i, "release_pct", e.target.value)} disabled={!canEdit} />
                  <Button type="button" variant="ghost" size="icon" disabled={!canEdit || tiers.length <= 1}
                    onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))} aria-label="Hapus tingkat">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {canEdit && (
                <Button type="button" variant="outline" size="sm" className="gap-1"
                  onClick={() => setTiers((prev) => [...prev, { min_pct: (prev[prev.length - 1]?.min_pct ?? 80) + 5, release_pct: 100 }])}>
                  <Plus className="h-4 w-4" /> Tambah tingkat
                </Button>
              )}
            </div>

            {validation ? (
              <p className="text-sm text-destructive">{validation}</p>
            ) : (
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                {describeTiers(tiers).map((l) => <li key={l}>{l}</li>)}
                <li>Dana yang sudah dibuka tidak ditarik kembali walaupun pencapaian turun.</li>
              </ul>
            )}

            {canEdit ? (
              <div className="flex justify-end">
                <Button onClick={() => update.mutate({ tiers: [...tiers].sort((a, b) => a.min_pct - b.min_pct), auto_release_enabled: autoEnabled })}
                  disabled={!changed || !!validation || update.isPending} className="gap-2">
                  {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Simpan
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Hanya Super Admin yang dapat mengubah pengaturan ini.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
