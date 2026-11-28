import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCaPolicySettings } from "@/hooks/useCaPolicy";
import { DEFAULT_CA_POLICY, jakartaToday } from "@/lib/ca-policy";
import { downloadNominativeReportXlsx } from "@/lib/exportEntertainmentNominativeXlsx";
import { formatRupiah, sumEntries } from "@/lib/entertainment-nominative";

/**
 * Rekap tahunan Daftar Nominatif Entertainment (Lampiran SPT) dalam format Excel.
 * Berisi dokumen final saja: realisasi CA yang disetujui dan Pengajuan Dana yang sudah dibayar/selesai.
 */
const EntertainmentNominativeReportCard = () => {
  const { data: policyData } = useCaPolicySettings();
  const policy = policyData ?? DEFAULT_CA_POLICY;
  const today = jakartaToday();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(String(currentYear));
  const [city, setCity] = useState("Jakarta");
  const [signerName, setSignerName] = useState("");
  const [includeSource, setIncludeSource] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setSummary(null);
    try {
      const { data, error } = await supabase.rpc("get_entertainment_nominative_report", { p_year: Number(year) });
      if (error) throw error;
      const rows = (data || []).map((r) => ({ ...r, amount: Number(r.amount) }));
      downloadNominativeReportXlsx(rows, {
        companyName: policy.company_legal_name,
        npwp: policy.company_npwp,
        taxYear: Number(year),
        signerCity: city,
        signedDate: today,
        signerName,
        includeSourceColumn: includeSource,
      });
      setSummary(`${rows.length} baris, total Rp ${formatRupiah(sumEntries(rows))}`);
      toast.success("Rekap Daftar Nominatif diunduh");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat rekap");
    } finally {
      setLoading(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5" />
          Rekap Daftar Nominatif Entertainment (Lampiran SPT)
        </CardTitle>
        <CardDescription>
          Ekspor Excel per tahun pajak dengan format Daftar Nominatif perusahaan. Hanya berisi realisasi CA yang sudah disetujui dan
          Pengajuan Dana yang sudah dibayar/selesai.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label>Tahun pajak</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kota</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Nama penandatangan (opsional)</Label>
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={120} placeholder="Kosongkan untuk diisi manual" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="nominative-include-source" checked={includeSource} onCheckedChange={(v) => setIncludeSource(v === true)} />
          <Label htmlFor="nominative-include-source" className="font-normal">
            Tambahkan kolom No. Dokumen (untuk arsip internal, bukan untuk lampiran SPT)
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleExport} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Unduh Excel
          </Button>
          {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
        </div>
      </CardContent>
    </Card>
  );
};

export default EntertainmentNominativeReportCard;
