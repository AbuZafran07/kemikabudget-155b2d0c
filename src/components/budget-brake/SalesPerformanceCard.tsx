import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Loader2, Pencil, RefreshCw, Save, TrendingUp, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import {
  useBudgetReleaseSettings,
  useSalesAchievement,
  useSalesPerformance,
  useSaveSalesPerformance,
  useSyncSalesPerformance,
} from "@/hooks/useBudgetBrake";
import { MONTH_NAMES_ID, formatRp, nextTier } from "@/lib/budget-brake";

interface Props {
  year: number;
}

type Draft = Record<number, { target: string; actual: string }>;

const toNum = (v: string) => {
  const n = Number(String(v).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Pencapaian penjualan + data bulanan (sinkron Finance Yield / isi manual). */
export const SalesPerformanceCard = ({ year }: Props) => {
  const { hasRoleExact } = useAuth();
  const canEdit = hasRoleExact("super_admin") || hasRoleExact("finance");
  const { data: achievement, isLoading: achLoading } = useSalesAchievement(year);
  const { data: rows = [], isLoading: rowsLoading } = useSalesPerformance(year);
  const { data: settings } = useBudgetReleaseSettings();
  const sync = useSyncSalesPerformance();
  const save = useSaveSalesPerformance();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({});

  const byMonth = useMemo(() => new Map(rows.map((r) => [r.month, r])), [rows]);

  useEffect(() => {
    if (!editing) return;
    const d: Draft = {};
    for (let m = 1; m <= 12; m++) {
      const r = byMonth.get(m);
      d[m] = { target: r ? String(Math.round(r.target_amount)) : "", actual: r ? String(Math.round(r.actual_invoice_amount)) : "" };
    }
    setDraft(d);
  }, [editing, byMonth]);

  const pct = achievement?.achievement_pct ?? null;
  const next = settings ? nextTier(settings.tiers, pct) : null;

  const onSave = () => {
    const payload = Object.entries(draft)
      .filter(([, v]) => v.target !== "" || v.actual !== "")
      .map(([m, v]) => ({ year, month: Number(m), target_amount: toNum(v.target), actual_invoice_amount: toNum(v.actual) }));
    save.mutate(payload, { onSuccess: () => setEditing(false) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Pencapaian Penjualan {year}
          </CardTitle>
          <CardDescription>
            Total perusahaan (B2B + B2C + B2G) dari Finance Yield: realisasi invoice dibanding target, kumulatif
            sampai bulan terakhir yang sudah lewat.
          </CardDescription>
        </div>
        {canEdit && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => sync.mutate(year)} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sinkron Finance Yield
            </Button>
            {!editing ? (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Isi manual
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
                <Button size="sm" className="gap-1" onClick={onSave} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan
                </Button>
              </>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {achLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{pct === null ? "—" : `${pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}</span>
                <span className="text-sm text-muted-foreground">
                  {achievement && achievement.months_counted > 0 && achievement.last_month
                    ? `Januari – ${MONTH_NAMES_ID[achievement.last_month - 1]} (${achievement.months_counted} bulan)`
                    : "belum ada bulan yang dihitung"}
                </span>
              </div>
              <Progress value={Math.min(pct ?? 0, 100)} />
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={achievement && achievement.tier_release_pct > 0 ? "default" : "secondary"}>
                  Dibuka {achievement?.tier_release_pct ?? 0}% dari dana ditahan
                </Badge>
                {next && <Badge variant="outline">Berikutnya: ≥ {next.min_pct}% → {next.release_pct}%</Badge>}
                {settings && !settings.auto_release_enabled && <Badge variant="destructive">Buka otomatis dimatikan</Badge>}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Target kumulatif</p>
              <p className="font-semibold">{formatRp(achievement?.target_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Realisasi invoice kumulatif</p>
              <p className="font-semibold">{formatRp(achievement?.actual_amount)}</p>
            </div>
          </div>
        )}
        {settings?.last_sync_at && (
          <p className="text-xs text-muted-foreground">
            Sinkron terakhir: {format(new Date(settings.last_sync_at), "d MMM yyyy HH:mm", { locale: localeId })} — {settings.last_sync_status}
          </p>
        )}

        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Realisasi Invoice</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>Sumber</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Memuat...</TableCell></TableRow>
              ) : (
                MONTH_NAMES_ID.map((name, i) => {
                  const m = i + 1;
                  const r = byMonth.get(m);
                  const p = r && r.target_amount > 0 ? (r.actual_invoice_amount * 100) / r.target_amount : null;
                  return (
                    <TableRow key={m}>
                      <TableCell>{name}</TableCell>
                      {editing ? (
                        <>
                          <TableCell className="text-right">
                            <Input inputMode="numeric" className="h-8 text-right" value={draft[m]?.target ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...d[m], target: e.target.value } }))} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input inputMode="numeric" className="h-8 text-right" value={draft[m]?.actual ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...d[m], actual: e.target.value } }))} />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right">{r ? formatRp(r.target_amount) : "—"}</TableCell>
                          <TableCell className="text-right">{r ? formatRp(r.actual_invoice_amount) : "—"}</TableCell>
                        </>
                      )}
                      <TableCell className="text-right">{p === null ? "—" : `${p.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}</TableCell>
                      <TableCell>
                        {r ? <Badge variant="outline">{r.source === "finance_yield" ? "Finance Yield" : "Manual"}</Badge> : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
