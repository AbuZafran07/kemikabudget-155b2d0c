import { useState, useEffect } from "react";
import { useDocumentTemplates, DocumentTemplate } from "@/hooks/useDocumentTemplates";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Settings2, 
  Hash, 
  Eye, 
  Save, 
  RotateCcw,
  Building2,
  FileType,
  Stamp
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

const TEMPLATE_TYPES = [
  { value: "pengajuan_dana", label: "Pengajuan Dana" },
  { value: "receipt", label: "Bukti Pembayaran" },
  { value: "report", label: "Laporan" },
];

const NUMBER_PLACEHOLDERS = [
  { placeholder: "{YYYY}", description: "Tahun 4 digit (2026)" },
  { placeholder: "{YY}", description: "Tahun 2 digit (26)" },
  { placeholder: "{MM}", description: "Bulan 2 digit (01-12)" },
  { placeholder: "{DD}", description: "Tanggal 2 digit (01-31)" },
  { placeholder: "{DIV}", description: "Kode Divisi (HRGA, FIN, dll)" },
  { placeholder: "{SEQ}", description: "Nomor urut tanpa padding" },
  { placeholder: "{SEQ2}", description: "Nomor urut 2 digit (01)" },
  { placeholder: "{SEQ3}", description: "Nomor urut 3 digit (001)" },
  { placeholder: "{SEQ4}", description: "Nomor urut 4 digit (0001)" },
];

export default function DocumentTemplates() {
  const { t } = useLanguage();
  const { canEdit } = usePermissions();
  const { 
    templates, 
    sequences, 
    templatesLoading, 
    sequencesLoading,
    updateTemplate,
    resetSequence 
  } = useDocumentTemplates();

  const [selectedType, setSelectedType] = useState("pengajuan_dana");
  const [formData, setFormData] = useState<Partial<DocumentTemplate>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load template data when selection changes
  useEffect(() => {
    if (templates) {
      const template = templates.find(t => t.template_type === selectedType);
      if (template) {
        setFormData(template);
        setHasChanges(false);
      } else {
        // Default values for new template
        setFormData({
          template_type: selectedType,
          header_company_name: "PT. KEMIKA KARYA PRATAMA",
          header_address: "Jakarta, Indonesia",
          header_phone: "",
          header_email: "",
          header_logo_url: "",
          show_header: true,
          footer_text: "Dokumen ini digenerate secara otomatis oleh sistem.",
          footer_page_number: true,
          show_footer: true,
          number_format: "PD/{DIV}/{YYYY}/{SEQ4}",
          number_prefix: "PD",
          reset_sequence_yearly: true,
          reset_sequence_monthly: false,
          draft_watermark_text: "DRAFT",
          draft_watermark_opacity: 0.15,
          show_draft_watermark: true,
        });
        setHasChanges(false);
      }
    }
  }, [templates, selectedType]);

  const handleChange = (field: keyof DocumentTemplate, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (formData.id) {
      updateTemplate.mutate(formData as DocumentTemplate);
    }
    setHasChanges(false);
  };

  // Generate preview of document number
  const generatePreviewNumber = () => {
    if (!formData.number_format) return "-";
    let result = formData.number_format;
    const now = new Date();
    result = result.replace("{YYYY}", now.getFullYear().toString());
    result = result.replace("{YY}", now.getFullYear().toString().slice(-2));
    result = result.replace("{MM}", (now.getMonth() + 1).toString().padStart(2, "0"));
    result = result.replace("{DD}", now.getDate().toString().padStart(2, "0"));
    result = result.replace("{DIV}", "HRGA");
    result = result.replace("{SEQ}", "1");
    result = result.replace("{SEQ2}", "01");
    result = result.replace("{SEQ3}", "001");
    result = result.replace("{SEQ4}", "0001");
    return result;
  };

  if (templatesLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Template Dokumen
          </h1>
          <p className="text-muted-foreground">
            Konfigurasi header, footer, dan format nomor dokumen PDF
          </p>
        </div>
        {canEdit() && (
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || updateTemplate.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Simpan Perubahan
          </Button>
        )}
      </div>

      <div className="flex gap-4 items-center">
        <Label>Tipe Dokumen:</Label>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[250px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="header" className="space-y-4">
        <TabsList>
          <TabsTrigger value="header" className="gap-2">
            <Building2 className="h-4 w-4" />
            Header
          </TabsTrigger>
          <TabsTrigger value="footer" className="gap-2">
            <FileType className="h-4 w-4" />
            Footer
          </TabsTrigger>
          <TabsTrigger value="numbering" className="gap-2">
            <Hash className="h-4 w-4" />
            Penomoran
          </TabsTrigger>
          <TabsTrigger value="watermark" className="gap-2">
            <Stamp className="h-4 w-4" />
            Watermark
          </TabsTrigger>
          <TabsTrigger value="sequences" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Sequence
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Preview
          </TabsTrigger>
        </TabsList>

        {/* Header Settings */}
        <TabsContent value="header">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Header</CardTitle>
              <CardDescription>
                Konfigurasi informasi perusahaan yang ditampilkan di header dokumen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show_header">Tampilkan Header</Label>
                <Switch
                  id="show_header"
                  checked={formData.show_header ?? true}
                  onCheckedChange={(checked) => handleChange("show_header", checked)}
                />
              </div>
              
              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="header_company_name">Nama Perusahaan</Label>
                  <Input
                    id="header_company_name"
                    value={formData.header_company_name ?? ""}
                    onChange={(e) => handleChange("header_company_name", e.target.value)}
                    disabled={!formData.show_header}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="header_logo_url">URL Logo</Label>
                  <Input
                    id="header_logo_url"
                    value={formData.header_logo_url ?? ""}
                    onChange={(e) => handleChange("header_logo_url", e.target.value)}
                    placeholder="https://..."
                    disabled={!formData.show_header}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="header_address">Alamat</Label>
                <Textarea
                  id="header_address"
                  value={formData.header_address ?? ""}
                  onChange={(e) => handleChange("header_address", e.target.value)}
                  disabled={!formData.show_header}
                  rows={2}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="header_phone">Telepon</Label>
                  <Input
                    id="header_phone"
                    value={formData.header_phone ?? ""}
                    onChange={(e) => handleChange("header_phone", e.target.value)}
                    disabled={!formData.show_header}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="header_email">Email</Label>
                  <Input
                    id="header_email"
                    type="email"
                    value={formData.header_email ?? ""}
                    onChange={(e) => handleChange("header_email", e.target.value)}
                    disabled={!formData.show_header}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Footer Settings */}
        <TabsContent value="footer">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Footer</CardTitle>
              <CardDescription>
                Konfigurasi teks dan nomor halaman di footer dokumen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show_footer">Tampilkan Footer</Label>
                <Switch
                  id="show_footer"
                  checked={formData.show_footer ?? true}
                  onCheckedChange={(checked) => handleChange("show_footer", checked)}
                />
              </div>
              
              <Separator />

              <div className="space-y-2">
                <Label htmlFor="footer_text">Teks Footer</Label>
                <Textarea
                  id="footer_text"
                  value={formData.footer_text ?? ""}
                  onChange={(e) => handleChange("footer_text", e.target.value)}
                  disabled={!formData.show_footer}
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="footer_page_number">Tampilkan Nomor Halaman</Label>
                <Switch
                  id="footer_page_number"
                  checked={formData.footer_page_number ?? true}
                  onCheckedChange={(checked) => handleChange("footer_page_number", checked)}
                  disabled={!formData.show_footer}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Numbering Settings */}
        <TabsContent value="numbering">
          <Card>
            <CardHeader>
              <CardTitle>Format Penomoran Dokumen</CardTitle>
              <CardDescription>
                Konfigurasi format dan reset sequence nomor dokumen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="number_prefix">Prefix</Label>
                  <Input
                    id="number_prefix"
                    value={formData.number_prefix ?? ""}
                    onChange={(e) => handleChange("number_prefix", e.target.value)}
                    placeholder="PD"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number_format">Format Nomor</Label>
                  <Input
                    id="number_format"
                    value={formData.number_format ?? ""}
                    onChange={(e) => handleChange("number_format", e.target.value)}
                    placeholder="PD/{DIV}/{YYYY}/{SEQ4}"
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-4 w-4" />
                  <Label>Preview Nomor:</Label>
                </div>
                <code className="text-lg font-mono font-bold text-primary">
                  {generatePreviewNumber()}
                </code>
              </div>

              <div className="space-y-2">
                <Label>Placeholder yang tersedia:</Label>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {NUMBER_PLACEHOLDERS.map(({ placeholder, description }) => (
                    <div 
                      key={placeholder}
                      className="flex items-center gap-2 p-2 bg-muted rounded text-sm"
                    >
                      <code className="font-mono text-primary">{placeholder}</code>
                      <span className="text-muted-foreground">- {description}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Reset Sequence</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="reset_sequence_yearly">Reset Tahunan</Label>
                    <p className="text-sm text-muted-foreground">
                      Nomor urut akan reset ke 1 setiap tahun baru
                    </p>
                  </div>
                  <Switch
                    id="reset_sequence_yearly"
                    checked={formData.reset_sequence_yearly ?? true}
                    onCheckedChange={(checked) => handleChange("reset_sequence_yearly", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="reset_sequence_monthly">Reset Bulanan</Label>
                    <p className="text-sm text-muted-foreground">
                      Nomor urut akan reset ke 1 setiap bulan baru
                    </p>
                  </div>
                  <Switch
                    id="reset_sequence_monthly"
                    checked={formData.reset_sequence_monthly ?? false}
                    onCheckedChange={(checked) => handleChange("reset_sequence_monthly", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Watermark Settings */}
        <TabsContent value="watermark">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Watermark</CardTitle>
              <CardDescription>
                Konfigurasi watermark DRAFT untuk dokumen yang belum approved
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="show_draft_watermark">Tampilkan Watermark DRAFT</Label>
                  <p className="text-sm text-muted-foreground">
                    Aktif untuk status: draft, submitted, under_review
                  </p>
                </div>
                <Switch
                  id="show_draft_watermark"
                  checked={formData.show_draft_watermark ?? true}
                  onCheckedChange={(checked) => handleChange("show_draft_watermark", checked)}
                />
              </div>
              
              <Separator />

              <div className="space-y-2">
                <Label htmlFor="draft_watermark_text">Teks Watermark</Label>
                <Input
                  id="draft_watermark_text"
                  value={formData.draft_watermark_text ?? ""}
                  onChange={(e) => handleChange("draft_watermark_text", e.target.value)}
                  disabled={!formData.show_draft_watermark}
                  placeholder="DRAFT"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Opacity: {Math.round((formData.draft_watermark_opacity ?? 0.15) * 100)}%
                </Label>
                <Slider
                  value={[(formData.draft_watermark_opacity ?? 0.15) * 100]}
                  onValueChange={([value]) => handleChange("draft_watermark_opacity", value / 100)}
                  min={5}
                  max={50}
                  step={5}
                  disabled={!formData.show_draft_watermark}
                />
              </div>

              {/* Preview watermark */}
              <div className="relative p-8 bg-background border rounded-lg overflow-hidden">
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    opacity: formData.show_draft_watermark ? formData.draft_watermark_opacity : 0,
                  }}
                >
                  <span 
                    className="text-6xl font-bold text-destructive transform -rotate-45"
                  >
                    {formData.draft_watermark_text || "DRAFT"}
                  </span>
                </div>
                <p className="text-center text-muted-foreground">
                  Preview area dokumen dengan watermark
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sequences Management */}
        <TabsContent value="sequences">
          <Card>
            <CardHeader>
              <CardTitle>Manajemen Sequence</CardTitle>
              <CardDescription>
                Lihat dan kelola nomor urut dokumen per divisi dan tahun
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sequencesLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : sequences && sequences.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Divisi</TableHead>
                      <TableHead>Tahun</TableHead>
                      <TableHead>Bulan</TableHead>
                      <TableHead className="text-right">Sequence</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sequences.map((seq) => (
                      <TableRow key={seq.id}>
                        <TableCell>
                          <Badge variant="outline">{seq.template_type}</Badge>
                        </TableCell>
                        <TableCell>
                          {seq.division?.code || "-"}
                        </TableCell>
                        <TableCell>{seq.year}</TableCell>
                        <TableCell>{seq.month || "-"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {seq.current_sequence}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reset Sequence?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Sequence untuk {seq.division?.code || "General"} tahun {seq.year} akan direset ke 0.
                                  Aksi ini tidak dapat dibatalkan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => resetSequence.mutate(seq.id)}
                                >
                                  Reset
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Belum ada sequence yang dibuat. Sequence akan otomatis dibuat saat dokumen pertama digenerate.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview */}
        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Preview Dokumen</CardTitle>
              <CardDescription>
                Lihat preview tampilan dokumen dengan pengaturan saat ini
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-8 bg-background min-h-[500px] relative">
                {/* Draft Watermark Preview */}
                {formData.show_draft_watermark && (
                  <div 
                    className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
                    style={{ opacity: formData.draft_watermark_opacity }}
                  >
                    <span className="text-8xl font-bold text-destructive transform -rotate-45">
                      {formData.draft_watermark_text || "DRAFT"}
                    </span>
                  </div>
                )}

                {/* Header Preview */}
                {formData.show_header && (
                  <div className="border-b pb-4 mb-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-xl font-bold">
                          {formData.header_company_name}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {formData.header_address}
                        </p>
                        {(formData.header_phone || formData.header_email) && (
                          <p className="text-sm text-muted-foreground">
                            {formData.header_phone}
                            {formData.header_phone && formData.header_email && " | "}
                            {formData.header_email}
                          </p>
                        )}
                      </div>
                      {formData.header_logo_url && (
                        <img 
                          src={formData.header_logo_url} 
                          alt="Logo"
                          className="h-16 object-contain"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Document Title & Number */}
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold mb-2">PENGAJUAN DANA</h1>
                  <p className="text-muted-foreground">
                    No: <span className="font-mono">{generatePreviewNumber()}</span>
                  </p>
                </div>

                {/* Sample Content */}
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-muted-foreground">Tanggal:</span>
                      <span className="ml-2">{new Date().toLocaleDateString("id-ID")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Divisi:</span>
                      <span className="ml-2">HRGA</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Deskripsi:</span>
                    <p className="mt-1">Contoh deskripsi pengajuan dana...</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Jumlah:</span>
                    <span className="ml-2 font-bold">Rp 1.000.000</span>
                  </div>
                </div>

                {/* Footer Preview */}
                {formData.show_footer && (
                  <div className="absolute bottom-8 left-8 right-8 border-t pt-4 text-sm text-muted-foreground flex justify-between">
                    <span>{formData.footer_text}</span>
                    {formData.footer_page_number && <span>Halaman 1 dari 1</span>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
