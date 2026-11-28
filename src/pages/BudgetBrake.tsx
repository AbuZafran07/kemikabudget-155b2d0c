import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Gauge, History, Loader2, Lock, LockOpen, Search, Settings2, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesPerformanceCard } from "@/components/budget-brake/SalesPerformanceCard";
import { BudgetReleaseSettingsCard } from "@/components/budget-brake/BudgetReleaseSettingsCard";
import {
  useBudgetBrakeOverview,
  useBudgetReleaseEvents,
  useReleaseBudgetManual,
  useSetBudgetReleasePlan,
  useSetBudgetReleasePlanBulk,
  type BudgetBrakeLine,
} from "@/hooks/useBudgetBrake";
import { RELEASE_EVENT_LABEL, RELEASE_MODE_LABEL, formatRp, type ReleaseMode } from "@/lib/budget-brake";

const MODE_BADGE: Record<ReleaseMode, "secondary" | "default" | "outline"> = { none: "secondary", sales: "default", manual: "outline" };
const digits = (v: string) => Number(String(v).replace(/[^0-9]/g, "")) || 0;
const fmtInput = (n: number) => (n ? new Intl.NumberFormat("id-ID").format(n) : "");

const BudgetBrake = () => {
  const { hasRoleExact } = useAuth();
  const isSuperAdmin = hasRoleExact("super_admin");
  const canPlan = isSuperAdmin || hasRoleExact("finance");

  const { data: periods = [] } = useQuery({
    queryKey: ["budget-periods-for-brake"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budget_periods").select("id, name, year, is_active, is_closed").order("year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [periodId, setPeriodId] = useState<string>();
  useEffect(() => {
    if (!periodId && periods.length) setPeriodId((periods.find((p) => p.is_active) ?? periods[0]).id);
  }, [periods, periodId]);
  const period = periods.find((p) => p.id === periodId);

  const { data: lines = [], isLoading } = useBudgetBrakeOverview(periodId);
  const budgetIds = useMemo(() => lines.map((l) => l.budget_id), [lines]);
  const { data: events = [] } = useBudgetReleaseEvents(periodId ? budgetIds : undefined);
  const lineById = useMemo(() => new Map(lines.map((l) => [l.budget_id, l])), [lines]);

  const [division, setDivision] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const divisions = useMemo(() => {
    const m = new Map<string, string>();
    lines.forEach((l) => m.set(l.division_id, `${l.division_code} — ${l.division_name}`));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [lines]);
  const filtered = lines.filter((l) =>
    (division === "all" || l.division_id === division) &&
    (modeFilter === "all" || l.release_mode === modeFilter) &&
    (!search || `${l.category_code} ${l.category_name} ${l.division_code}`.toLowerCase().includes(search.toLowerCase())));
  const totals = filtered.reduce(
    (a, l) => ({ allocated: a.allocated + l.allocated, released: a.released + l.released, held: a.held + l.held, used: a.used + l.used, reserved: a.reserved + l.reserved }),
    { allocated: 0, released: 0, held: 0, used: 0, reserved: 0 });

  // dialog: rencana per pos
  const setPlan = useSetBudgetReleasePlan();
  const [planLine, setPlanLine] = useState<BudgetBrakeLine | null>(null);
  const [planMode, setPlanMode] = useState<ReleaseMode>("sales");
  const [planInitial, setPlanInitial] = useState("");
  const [planNote, setPlanNote] = useState("");
  const openPlan = (l: BudgetBrakeLine) => {
    setPlanLine(l);
    setPlanMode(l.release_mode === "none" ? "sales" : l.release_mode);
    setPlanInitial(fmtInput(l.release_mode === "none" ? Math.round(l.allocated * 0.3) : l.initial_release));
    setPlanNote("");
  };
  const planMin = planLine ? Math.min(planLine.allocated, planLine.used + planLine.reserved) : 0;

  // dialog: buka manual
  const release = useReleaseBudgetManual();
  const [relLine, setRelLine] = useState<BudgetBrakeLine | null>(null);
  const [relAmount, setRelAmount] = useState("");
  const [relReason, setRelReason] = useState("");

  // dialog: massal
  const bulk = useSetBudgetReleasePlanBulk();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<ReleaseMode>("sales");
  const [bulkPct, setBulkPct] = useState("30");
  const [bulkOnlyUnset, setBulkOnlyUnset] = useState(true);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Gauge className="h-6 w-6" /> Rem Budget</h1>
          <p className="text-muted-foreground mt-1">
            Budget awal tiap pos dibuka lebih dulu; sisanya ditahan dan dibuka sesuai pencapaian penjualan atau oleh Super Admin.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Pilih periode" /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}{p.is_active ? " (aktif)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canPlan && periodId && (
            <Button variant="outline" className="gap-2" onClick={() => setBulkOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Atur massal
            </Button>
          )}
        </div>
      </div>

      {period && <SalesPerformanceCard year={period.year} />}

      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">Pos Anggaran</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="h-4 w-4" /> Riwayat</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings2 className="h-4 w-4" /> Pengaturan</TabsTrigger>
        </TabsList>

        <TabsContent value="lines" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              ["Plafon", totals.allocated],
              ["Sudah dibuka", totals.released],
              ["Ditahan", totals.held],
              ["Terpakai", totals.used],
              ["Dipesan (berjalan)", totals.reserved],
            ].map(([label, v]) => (
              <Card key={label as string}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold">{formatRp(v as number)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative md:max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari pos / divisi" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={division} onValueChange={setDivision}>
              <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua divisi</SelectItem>
                {divisions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={modeFilter} onValueChange={setModeFilter}>
              <SelectTrigger className="md:w-60"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua mode</SelectItem>
                {(Object.keys(RELEASE_MODE_LABEL) as ReleaseMode[]).map((m) => <SelectItem key={m} value={m}>{RELEASE_MODE_LABEL[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Divisi</TableHead>
                  <TableHead>Pos</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Plafon</TableHead>
                  <TableHead className="text-right">Budget awal</TableHead>
                  <TableHead className="text-right">Sudah dibuka</TableHead>
                  <TableHead className="text-right">Ditahan</TableHead>
                  <TableHead className="text-right">Terpakai + dipesan</TableHead>
                  <TableHead className="text-right">Tersedia</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Tidak ada pos anggaran</TableCell></TableRow>
                ) : filtered.map((l) => (
                  <TableRow key={l.budget_id}>
                    <TableCell className="whitespace-nowrap">{l.division_code}</TableCell>
                    <TableCell>
                      <div className="font-medium">{l.category_name}</div>
                      <div className="text-xs text-muted-foreground">{l.category_code}</div>
                    </TableCell>
                    <TableCell><Badge variant={MODE_BADGE[l.release_mode]}>{RELEASE_MODE_LABEL[l.release_mode]}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRp(l.allocated)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{l.release_mode === "none" ? "—" : formatRp(l.initial_release)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatRp(l.released)}
                      {l.release_mode === "sales" && l.auto_target !== null && l.auto_target > l.released && (
                        <div className="text-xs text-primary">siap dibuka s.d. {formatRp(l.auto_target)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {l.held > 0 ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />{formatRp(l.held)}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRp(l.used + l.reserved)}</TableCell>
                    <TableCell className={`text-right whitespace-nowrap ${l.available < 0 ? "text-destructive" : ""}`}>{formatRp(l.available)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap space-x-1">
                      {canPlan && !period?.is_closed && (
                        <Button size="sm" variant="outline" onClick={() => openPlan(l)}>Atur</Button>
                      )}
                      {isSuperAdmin && l.release_mode !== "none" && l.held > 0 && (
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => { setRelLine(l); setRelAmount(fmtInput(l.held)); setRelReason(""); }}>
                          <LockOpen className="h-3 w-3" /> Buka
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Riwayat pembukaan dana</CardTitle>
              <CardDescription>100 catatan terbaru pada periode ini.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Pos</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead className="text-right">Dibuka sebelum</TableHead>
                    <TableHead className="text-right">Dibuka sesudah</TableHead>
                    <TableHead>Pencapaian</TableHead>
                    <TableHead>Alasan / keterangan</TableHead>
                    <TableHead>Oleh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Belum ada riwayat</TableCell></TableRow>
                  ) : events.map((e) => {
                    const l = lineById.get(e.division_budget_id);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(e.created_at), "d MMM yyyy HH:mm", { locale: localeId })}</TableCell>
                        <TableCell>{l ? `${l.division_code} · ${l.category_name}` : "-"}</TableCell>
                        <TableCell><Badge variant="outline">{RELEASE_EVENT_LABEL[e.event_type] ?? e.event_type}</Badge></TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatRp(e.released_before)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatRp(e.released_after)}</TableCell>
                        <TableCell>{e.achievement_pct === null ? "—" : `${Number(e.achievement_pct).toLocaleString("id-ID")}%`}</TableCell>
                        <TableCell className="max-w-xs">{e.reason}</TableCell>
                        <TableCell>{e.performer_name ?? (e.event_type === "auto" ? "Sistem" : "-")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <BudgetReleaseSettingsCard />
        </TabsContent>
      </Tabs>

      {/* Atur rencana per pos */}
      <Dialog open={!!planLine} onOpenChange={(o) => !o && setPlanLine(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur Rem Budget</DialogTitle>
            <DialogDescription>{planLine && `${planLine.division_code} · ${planLine.category_name} — plafon ${formatRp(planLine.allocated)}`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={planMode} onValueChange={(v) => setPlanMode(v as ReleaseMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">{RELEASE_MODE_LABEL.sales}</SelectItem>
                  <SelectItem value="manual">{RELEASE_MODE_LABEL.manual}</SelectItem>
                  <SelectItem value="none">{RELEASE_MODE_LABEL.none}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {planMode === "sales" && "Sisa plafon dibuka otomatis sesuai pencapaian penjualan saat dana terbuka tidak cukup."}
                {planMode === "manual" && "Sisa plafon hanya dibuka oleh Super Admin (mis. pembelian gudang, renovasi HO)."}
                {planMode === "none" && "Seluruh plafon langsung terbuka (mis. Warehouse, Purchasing, fee penjaja barang)."}
              </p>
            </div>
            {planMode !== "none" && (
              <div className="space-y-2">
                <Label>Budget awal yang dibuka</Label>
                <Input inputMode="numeric" value={planInitial} onChange={(e) => setPlanInitial(fmtInput(digits(e.target.value)))} />
                <div className="flex flex-wrap gap-1">
                  {[25, 30, 50].map((p) => planLine && (
                    <Button key={p} type="button" size="sm" variant="ghost" onClick={() => setPlanInitial(fmtInput(Math.round(planLine.allocated * p / 100)))}>{p}%</Button>
                  ))}
                </div>
                {planMin > digits(planInitial) && (
                  <p className="text-xs text-amber-600">
                    Pos ini sudah terpakai/dipesan {formatRp(planMin)}; budget awal akan dinaikkan otomatis ke nilai itu.
                  </p>
                )}
                {planLine && planLine.release_mode !== "none" && (
                  <p className="text-xs text-muted-foreground">Dana yang sudah dibuka ({formatRp(planLine.released)}) tidak akan dikurangi.</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Catatan (opsional)</Label>
              <Textarea rows={2} value={planNote} onChange={(e) => setPlanNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanLine(null)}>Batal</Button>
            <Button disabled={setPlan.isPending || (planMode !== "none" && !!planLine && digits(planInitial) > planLine.allocated)}
              onClick={() => planLine && setPlan.mutate(
                { budgetId: planLine.budget_id, mode: planMode, initial: planMode === "none" ? 0 : digits(planInitial), note: planNote },
                { onSuccess: () => setPlanLine(null) })}>
              {setPlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buka manual */}
      <Dialog open={!!relLine} onOpenChange={(o) => !o && setRelLine(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buka dana manual</DialogTitle>
            <DialogDescription>
              {relLine && `${relLine.division_code} · ${relLine.category_name} — masih ditahan ${formatRp(relLine.held)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nominal yang dibuka</Label>
              <Input inputMode="numeric" value={relAmount} onChange={(e) => setRelAmount(fmtInput(digits(e.target.value)))} />
            </div>
            <div className="space-y-2">
              <Label>Alasan (wajib, tercatat di riwayat)</Label>
              <Textarea rows={3} value={relReason} onChange={(e) => setRelReason(e.target.value)} placeholder="mis. Persetujuan Direksi untuk pembelian gudang tahap 1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelLine(null)}>Batal</Button>
            <Button disabled={release.isPending || digits(relAmount) <= 0 || relReason.trim().length < 5}
              onClick={() => relLine && release.mutate(
                { budgetId: relLine.budget_id, amount: digits(relAmount), reason: relReason.trim() },
                { onSuccess: () => setRelLine(null) })}>
              {release.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Buka dana
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Atur massal */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur Rem Budget massal</DialogTitle>
            <DialogDescription>Budget awal = persentase dari plafon tiap pos{division !== "all" ? " pada divisi terpilih" : " di semua divisi"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as ReleaseMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">{RELEASE_MODE_LABEL.sales}</SelectItem>
                  <SelectItem value="manual">{RELEASE_MODE_LABEL.manual}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Budget awal (% dari plafon)</Label>
              <Input type="number" min={0} max={100} value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Hanya pos yang masih "Tanpa rem"</Label>
                <p className="text-xs text-muted-foreground">Pos yang sudah diatur tidak diubah.</p>
              </div>
              <Switch checked={bulkOnlyUnset} onCheckedChange={setBulkOnlyUnset} />
            </div>
            <p className="text-xs text-muted-foreground">
              Pos yang sudah terpakai/dipesan melebihi budget awal otomatis dinaikkan agar pengajuan berjalan tidak tersangkut.
              Setelah itu tandai pos khusus (Warehouse, Purchasing, fee penjaja barang) sebagai "Tanpa rem" lewat tombol Atur.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Batal</Button>
            <Button disabled={bulk.isPending || !periodId || Number(bulkPct) < 0 || Number(bulkPct) > 100 || bulkPct === ""}
              onClick={() => periodId && bulk.mutate(
                { periodId, divisionId: division === "all" ? null : division, mode: bulkMode, initialPct: Number(bulkPct), onlyUnset: bulkOnlyUnset },
                { onSuccess: () => setBulkOpen(false) })}>
              {bulk.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Terapkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetBrake;
