import { useEffect, useRef, useState } from "react";
import { Copy, Download, Eye, FileSignature, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCaPolicySettings } from "@/hooks/useCaPolicy";
import {
  openSignedNominative,
  useEntertainmentNominative,
  useNominativeStatus,
  useSaveNominative,
  useUploadSignedNominative,
} from "@/hooks/useEntertainmentNominative";
import { DEFAULT_CA_POLICY, jakartaToday } from "@/lib/ca-policy";
import {
  NOMINATIVE_REQUIRED_FIELDS,
  emptyNominativeEntry,
  entryFromRow,
  formatNominativeDate,
  formatRupiah,
  missingEntryFields,
  sumEntries,
  type NominativeEntryInput,
  type NominativeSource,
} from "@/lib/entertainment-nominative";
import { downloadEntertainmentNominativePDF } from "@/lib/generateEntertainmentNominativePDF";
import { compressImage, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_LABEL } from "@/lib/imageCompression";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

interface EntertainmentNominativeCardProps {
  /** null = dokumen belum disimpan */
  source: NominativeSource | null;
  editable: boolean;
  /** Nomor dokumen untuk PDF, mis. "CA/2026/0012 / STL/2026/0003" */
  documentRef?: string;
  /** Nominal pos Entertainment yang sedang tampil di form (belum tentu tersimpan) */
  liveRequiredAmount?: number;
  /** Nama pemohon untuk penandatangan default */
  defaultSignerName?: string;
  defaultEntryDate?: string;
}

const EntertainmentNominativeCard = ({
  source,
  editable,
  documentRef,
  liveRequiredAmount,
  defaultSignerName,
  defaultEntryDate,
}: EntertainmentNominativeCardProps) => {
  const { language } = useLanguage();
  const en = language === "en";
  const { data: policyData } = useCaPolicySettings();
  const policy = policyData ?? DEFAULT_CA_POLICY;
  const { data, isLoading } = useEntertainmentNominative(source);
  const { data: status } = useNominativeStatus(source);
  const saveNominative = useSaveNominative();
  const uploadSigned = useUploadSignedNominative();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const header = data?.header ?? null;
  const entries = data?.entries ?? [];
  const today = jakartaToday();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NominativeEntryInput[]>([]);
  const [signerName, setSignerName] = useState("");
  const [signerCity, setSignerCity] = useState("Jakarta");
  const [signedDate, setSignedDate] = useState(today);
  const [showErrors, setShowErrors] = useState(false);

  const requiredAmount = liveRequiredAmount ?? status?.required_amount ?? 0;
  const savedTotal = sumEntries(entries.map((e) => ({ amount: Number(e.amount) })));

  useEffect(() => {
    if (!open) return;
    setDraft(entries.length > 0 ? entries.map(entryFromRow) : [emptyNominativeEntry(defaultEntryDate || today)]);
    setSignerName(header?.signer_name || defaultSignerName || "");
    setSignerCity(header?.signer_city || "Jakarta");
    setSignedDate(header?.signed_date || today);
    setShowErrors(false);
    // hanya saat dialog dibuka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draftTotal = sumEntries(draft);
  const draftInvalid = draft.some((e) => missingEntryFields(e).length > 0) || draft.length === 0;

  const updateDraft = (key: string, field: keyof NominativeEntryInput, value: string | number) =>
    setDraft((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  const handleSave = async () => {
    if (!source) return;
    setShowErrors(true);
    if (draftInvalid) {
      toast.error(en ? "Complete all required fields on every row." : "Lengkapi semua kolom wajib di setiap baris.");
      return;
    }
    try {
      await saveNominative.mutateAsync({
        source,
        headerId: header?.id ?? null,
        signerName,
        signerCity,
        signedDate,
        entries: draft,
      });
      toast.success(en ? "Nominative list saved" : "Daftar Nominatif disimpan");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : en ? "Failed to save" : "Gagal menyimpan");
    }
  };

  const handleDownloadPdf = () => {
    if (entries.length === 0) return;
    const year = Number((entries[0]?.entry_date || today).slice(0, 4));
    downloadEntertainmentNominativePDF(
      {
        companyName: policy.company_legal_name,
        npwp: policy.company_npwp,
        taxYear: year,
        documentRef,
        entries: entries.map((e) => ({ ...e, amount: Number(e.amount) })),
        signerCity: header?.signer_city || "Jakarta",
        signedDate: header?.signed_date || today,
        signerName: header?.signer_name || defaultSignerName || "",
      },
      `Daftar_Nominatif_Entertainment_${(documentRef || "dokumen").replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`,
    );
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!picked || !source || !header) return;
    if (!ALLOWED_TYPES.includes(picked.type)) {
      toast.error(en ? "Only JPG, PNG, WEBP or PDF files are allowed" : "Hanya file JPG, PNG, WEBP, atau PDF yang diizinkan");
      return;
    }
    let file: File = picked;
    if (file.type.startsWith("image/")) file = await compressImage(file, 0.7, MAX_FILE_SIZE_BYTES);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(en ? `File exceeds ${MAX_FILE_SIZE_LABEL}` : `File melebihi batas ${MAX_FILE_SIZE_LABEL}`);
      return;
    }
    try {
      await uploadSigned.mutateAsync({ source, headerId: header.id, file, oldPath: header.signed_file_path });
      toast.success(en ? "Signed document uploaded" : "Dokumen bertanda tangan diunggah");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : en ? "Upload failed" : "Gagal mengunggah");
    }
  };

  // ---- Ringkasan status
  const totalMismatch = entries.length > 0 && savedTotal !== requiredAmount;
  const signedOk = !!status?.has_signed_file;
  const complete = entries.length > 0 && !totalMismatch && signedOk && !status?.missing_category;
  const problems: string[] = [];
  if (!source) problems.push(en ? "Save the document first, then fill in the list." : "Simpan dokumen terlebih dahulu, lalu isi daftar.");
  else {
    if (entries.length === 0) problems.push(en ? "Recipient data not filled in yet." : "Data penerima entertainment belum diisi.");
    if (totalMismatch)
      problems.push(
        en
          ? `List total Rp ${formatRupiah(savedTotal)} must equal the Entertainment amount Rp ${formatRupiah(requiredAmount)}.`
          : `Total daftar Rp ${formatRupiah(savedTotal)} harus sama dengan nominal pos Entertainment Rp ${formatRupiah(requiredAmount)}.`,
      );
    if (entries.length > 0 && status?.signed_outdated)
      problems.push(
        en
          ? "The list changed after the signed file was uploaded. Download, sign, and upload again."
          : "Isi daftar berubah setelah file bertanda tangan diunggah. Unduh, tanda tangani, lalu unggah ulang.",
      );
    else if (entries.length > 0 && !signedOk)
      problems.push(en ? "Signed version not uploaded yet." : "Versi bertanda tangan belum diunggah.");
  }

  return (
    <Card className={complete ? "" : "border-amber-500/60"}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-5 w-5" />
            {en ? "Entertainment Nominative List" : "Daftar Nominatif Entertainment"}
          </CardTitle>
          {complete ? (
            <Badge className="bg-green-600 hover:bg-green-600">{en ? "Complete" : "Lengkap"}</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {en ? "Incomplete" : "Belum lengkap"}
            </Badge>
          )}
        </div>
        <CardDescription>
          {en
            ? "Required for the Entertainment budget line: recipient data in the tax nominative-list format, plus the signed version."
            : "Wajib untuk pos Entertainment: data penerima sesuai format Daftar Nominatif (Lampiran SPT) dan versi bertanda tangan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">{en ? "Entertainment amount" : "Nominal pos Entertainment"}</p>
            <p className="font-semibold">Rp {formatRupiah(requiredAmount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{en ? "List total" : "Total daftar"}</p>
            <p className={`font-semibold ${totalMismatch ? "text-destructive" : ""}`}>
              Rp {formatRupiah(savedTotal)} ({entries.length} {en ? "rows" : "baris"})
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{en ? "Signed file" : "File bertanda tangan"}</p>
            {header?.signed_file_path ? (
              <button
                type="button"
                className={`font-semibold hover:underline text-left ${signedOk ? "text-primary" : "text-destructive"}`}
                onClick={async () => {
                  if (!(await openSignedNominative(header.signed_file_path!)))
                    toast.error(en ? "Unable to open file" : "File tidak dapat dibuka");
                }}
              >
                <Eye className="inline h-4 w-4 mr-1" />
                {header.signed_file_name || (en ? "View" : "Lihat")}
                {!signedOk && (en ? " (outdated)" : " (tidak berlaku)")}
              </button>
            ) : (
              <p className="font-semibold text-muted-foreground">-</p>
            )}
          </div>
        </div>

        {problems.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-400 space-y-1">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{en ? "Loading..." : "Memuat..."}</p>
        ) : entries.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2">No</th>
                  <th className="p-2">{en ? "Date" : "Tanggal"}</th>
                  <th className="p-2">{en ? "Place" : "Tempat"}</th>
                  <th className="p-2">{en ? "Type" : "Jenis"}</th>
                  <th className="p-2 text-right">{en ? "Amount" : "Jumlah"}</th>
                  <th className="p-2">{en ? "Recipient" : "Penerima"}</th>
                  <th className="p-2">{en ? "Company" : "Perusahaan"}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} className="border-t align-top">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2 whitespace-nowrap">{formatNominativeDate(e.entry_date)}</td>
                    <td className="p-2">{e.place}</td>
                    <td className="p-2">{e.entertainment_type}</td>
                    <td className="p-2 text-right whitespace-nowrap">{formatRupiah(Number(e.amount))}</td>
                    <td className="p-2">
                      {e.recipient_name}
                      <span className="block text-muted-foreground">{e.recipient_position}</span>
                    </td>
                    <td className="p-2">{e.recipient_company}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button type="button" variant={entries.length ? "outline" : "default"} disabled={!source} onClick={() => setOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              {entries.length ? (en ? "Edit list" : "Ubah daftar") : en ? "Fill in list" : "Isi Daftar Nominatif"}
            </Button>
          )}
          <Button type="button" variant="outline" disabled={entries.length === 0} onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" />
            {en ? "Download PDF to sign" : "Unduh PDF untuk ditandatangani"}
          </Button>
          {editable && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!header || entries.length === 0 || uploadSigned.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadSigned.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {header?.signed_file_path ? (en ? "Replace signed file" : "Ganti file bertanda tangan") : en ? "Upload signed file" : "Unggah file bertanda tangan"}
              </Button>
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleFile} />
            </>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{en ? "Entertainment Nominative List" : "Daftar Nominatif Entertainment"}</DialogTitle>
            <DialogDescription>
              {en
                ? "Fill in one row per entertainment transaction/receipt and its business-relation recipient."
                : "Isi satu baris per transaksi/nota entertainment beserta relasi usaha penerimanya."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>{en ? "Signed by (giver)" : "Penandatangan (pemberi)"} *</Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label>{en ? "City" : "Kota"}</Label>
              <Input value={signerCity} onChange={(e) => setSignerCity(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1">
              <Label>{en ? "Signing date" : "Tanggal tanda tangan"}</Label>
              <Input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-4">
            {draft.map((row, index) => {
              const missing = showErrors ? missingEntryFields(row) : [];
              const err = (f: keyof NominativeEntryInput) => (missing.includes(f) ? "border-destructive" : "");
              const label = (f: keyof NominativeEntryInput) => {
                const def = NOMINATIVE_REQUIRED_FIELDS.find((x) => x.field === f);
                return def ? `${en ? def.en : def.id} *` : "";
              };
              return (
                <div key={row.key} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">
                      {en ? "Row" : "Baris"} {index + 1}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title={en ? "Duplicate row" : "Salin baris"}
                        onClick={() =>
                          setDraft((rows) => {
                            const copy = { ...row, key: emptyNominativeEntry(row.entry_date).key, amount: 0 };
                            const next = [...rows];
                            next.splice(index + 1, 0, copy);
                            return next;
                          })
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={draft.length <= 1}
                        onClick={() => setDraft((rows) => rows.filter((r) => r.key !== row.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {en ? "ENTERTAINMENT GIVEN" : "PEMBERI ENTERTAINMENT DAN SEJENISNYA"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">{label("entry_date")}</Label>
                      <Input type="date" className={err("entry_date")} value={row.entry_date} onChange={(e) => updateDraft(row.key, "entry_date", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{label("place")}</Label>
                      <Input className={err("place")} value={row.place} maxLength={150} onChange={(e) => updateDraft(row.key, "place", e.target.value)} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">{label("address")}</Label>
                      <Input className={err("address")} value={row.address} maxLength={300} onChange={(e) => updateDraft(row.key, "address", e.target.value)} />
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs">{label("entertainment_type")}</Label>
                      <Textarea
                        rows={2}
                        className={err("entertainment_type")}
                        value={row.entertainment_type}
                        maxLength={500}
                        placeholder={en ? "e.g. Business dinner discussing ..." : "mis. Jamuan makan membahas ..."}
                        onChange={(e) => updateDraft(row.key, "entertainment_type", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{label("amount")} (Rp)</Label>
                      <Input
                        type="number"
                        min={0}
                        className={`text-right ${err("amount")}`}
                        value={row.amount || ""}
                        onChange={(e) => updateDraft(row.key, "amount", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {en ? "BUSINESS RELATION RECEIVING ENTERTAINMENT" : "RELASI USAHA YANG DIBERIKAN ENTERTAINMENT"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">{label("recipient_name")}</Label>
                      <Input className={err("recipient_name")} value={row.recipient_name} maxLength={150} onChange={(e) => updateDraft(row.key, "recipient_name", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{label("recipient_position")}</Label>
                      <Input className={err("recipient_position")} value={row.recipient_position} maxLength={150} onChange={(e) => updateDraft(row.key, "recipient_position", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{label("recipient_company")}</Label>
                      <Input className={err("recipient_company")} value={row.recipient_company} maxLength={200} onChange={(e) => updateDraft(row.key, "recipient_company", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{label("recipient_business_type")}</Label>
                      <Input
                        className={err("recipient_business_type")}
                        value={row.recipient_business_type}
                        maxLength={150}
                        onChange={(e) => updateDraft(row.key, "recipient_business_type", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-4">
                      <Label className="text-xs">{en ? "Remarks" : "Keterangan"}</Label>
                      <Input value={row.notes} maxLength={300} onChange={(e) => updateDraft(row.key, "notes", e.target.value)} />
                    </div>
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDraft((rows) => [...rows, emptyNominativeEntry(rows[rows.length - 1]?.entry_date || defaultEntryDate || today)])}
            >
              <Plus className="h-4 w-4 mr-2" />
              {en ? "Add row" : "Tambah baris"}
            </Button>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm flex flex-wrap justify-between gap-2">
            <span>
              {en ? "Total" : "Total"}: <strong>Rp {formatRupiah(draftTotal)}</strong>
            </span>
            <span className={draftTotal === requiredAmount ? "text-green-600" : "text-destructive"}>
              {en ? "Entertainment amount" : "Nominal pos Entertainment"}: Rp {formatRupiah(requiredAmount)}
              {draftTotal !== requiredAmount && (en ? " (must match)" : " (harus sama)")}
            </span>
          </div>
          {header?.signed_file_path && (
            <p className="text-xs text-amber-600">
              {en
                ? "Changing the list makes the uploaded signed file invalid; you will need to sign and upload it again."
                : "Mengubah isi daftar membuat file bertanda tangan yang sudah diunggah tidak berlaku; Anda perlu menandatangani dan mengunggah ulang."}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {en ? "Cancel" : "Batal"}
            </Button>
            <Button type="button" onClick={handleSave} disabled={saveNominative.isPending || !signerName.trim()}>
              {saveNominative.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {en ? "Save list" : "Simpan daftar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EntertainmentNominativeCard;
