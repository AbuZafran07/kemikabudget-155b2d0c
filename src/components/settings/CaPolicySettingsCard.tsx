import { useEffect, useState } from "react";
import { Wallet, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCaPolicySettings, useUpdateCaPolicySettings } from "@/hooks/useCaPolicy";
import { DEFAULT_CA_POLICY, type CaPolicySettings } from "@/lib/ca-policy";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

export const CaPolicySettingsCard = () => {
  const { language } = useLanguage();
  const en = language === "en";
  const { hasRoleExact } = useAuth();
  const canEdit = hasRoleExact("super_admin");
  const { data, isLoading, error } = useCaPolicySettings();
  const updatePolicy = useUpdateCaPolicySettings();
  const [form, setForm] = useState<CaPolicySettings>(DEFAULT_CA_POLICY);

  useEffect(() => {
    if (data) {
      setForm({
        min_lead_days: data.min_lead_days,
        settlement_due_days: data.settlement_due_days,
        enforce_lead_time: data.enforce_lead_time,
        block_on_overdue_settlement: data.block_on_overdue_settlement,
        require_settlement_attachment: data.require_settlement_attachment,
        require_entertainment_nominative: data.require_entertainment_nominative,
        company_legal_name: data.company_legal_name,
        company_npwp: data.company_npwp,
      });
    }
  }, [data]);

  const changed =
    !!data &&
    (form.min_lead_days !== data.min_lead_days ||
      form.settlement_due_days !== data.settlement_due_days ||
      form.enforce_lead_time !== data.enforce_lead_time ||
      form.block_on_overdue_settlement !== data.block_on_overdue_settlement ||
      form.require_settlement_attachment !== data.require_settlement_attachment ||
      form.require_entertainment_nominative !== data.require_entertainment_nominative ||
      form.company_legal_name !== data.company_legal_name ||
      form.company_npwp !== data.company_npwp);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          {en ? "Cash Advance Policy" : "Kebijakan Cash Advance"}
        </CardTitle>
        <CardDescription>
          {en
            ? "Rules enforced by the system for every cash advance and realization."
            : "Aturan yang ditegakkan sistem untuk setiap pengajuan CA dan laporan realisasinya."}
          {!canEdit && (en ? " Only Super Admin can change these settings." : " Hanya Super Admin yang dapat mengubah pengaturan ini.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <p className="text-sm text-muted-foreground">{en ? "Loading..." : "Memuat..."}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {en ? "Policy settings could not be loaded." : "Pengaturan kebijakan belum dapat dimuat."}
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label>{en ? "Enforce minimum lead time" : "Wajibkan batas minimal pengajuan"}</Label>
            <p className="text-sm text-muted-foreground">
              {en ? "Late submissions are rejected." : "Pengajuan yang terlambat ditolak sistem."}
            </p>
          </div>
          <Switch
            checked={form.enforce_lead_time}
            disabled={!canEdit}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, enforce_lead_time: checked }))}
          />
        </div>
        <div className="space-y-2">
          <Label>{en ? "Submit at least (calendar days before activity)" : "Diajukan paling lambat (hari kalender sebelum kegiatan)"}</Label>
          <Input
            type="number"
            min={0}
            max={90}
            className="w-32"
            value={form.min_lead_days}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, min_lead_days: clamp(Number(e.target.value) || 0, 0, 90) }))}
          />
        </div>

        <div className="space-y-2">
          <Label>{en ? "Realization report due (days after activity ends)" : "Laporan realisasi paling lambat (hari setelah kegiatan selesai)"}</Label>
          <Input
            type="number"
            min={1}
            max={60}
            className="w-32"
            value={form.settlement_due_days}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, settlement_due_days: clamp(Number(e.target.value) || 1, 1, 60) }))}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label>{en ? "Block new CA while a report is overdue" : "Blokir CA baru bila ada laporan realisasi terlambat"}</Label>
            <p className="text-sm text-muted-foreground">
              {en
                ? "Applies to cash advances that have activity dates."
                : "Berlaku untuk CA yang memiliki tanggal kegiatan."}
            </p>
          </div>
          <Switch
            checked={form.block_on_overdue_settlement}
            disabled={!canEdit}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, block_on_overdue_settlement: checked }))}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label>{en ? "Require proof attachment for realization" : "Wajib lampiran bukti untuk realisasi"}</Label>
            <p className="text-sm text-muted-foreground">
              {en ? "Receipt, transfer/QRIS proof, or stamped receipt." : "Nota/kuitansi, bukti transfer/QRIS, atau tanda terima bermeterai."}
            </p>
          </div>
          <Switch
            checked={form.require_settlement_attachment}
            disabled={!canEdit}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, require_settlement_attachment: checked }))}
          />
        </div>

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label>{en ? "Require Entertainment nominative list" : "Wajib Daftar Nominatif Entertainment"}</Label>
              <p className="text-sm text-muted-foreground">
                {en
                  ? "For budget categories marked in Master Categories. Applies to CA realizations and fund requests."
                  : "Untuk pos yang ditandai di Master Kategori. Berlaku untuk realisasi CA dan Pengajuan Dana."}
              </p>
            </div>
            <Switch
              checked={form.require_entertainment_nominative}
              disabled={!canEdit}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, require_entertainment_nominative: checked }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{en ? "Company name (on nominative list)" : "Nama perusahaan (di Daftar Nominatif)"}</Label>
              <Input
                value={form.company_legal_name}
                disabled={!canEdit}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, company_legal_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>NPWP</Label>
              <Input
                value={form.company_npwp}
                disabled={!canEdit}
                maxLength={40}
                onChange={(e) => setForm((f) => ({ ...f, company_npwp: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {canEdit && (
          <Button onClick={() => updatePolicy.mutate(form)} disabled={!changed || updatePolicy.isPending || !form.company_legal_name.trim() || !form.company_npwp.trim()}>
            {updatePolicy.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {en ? "Save policy" : "Simpan kebijakan"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
