import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, Database, AlertTriangle, CheckCircle, Loader2, FileSpreadsheet, FileJson, Clock, Timer, Shield } from "lucide-react";
import { toast } from "sonner";
import { csvCell } from "@/lib/exportUtils";

interface BackupCategory {
  key: string;
  labelKey: string;
  tables: string[];
}

const BACKUP_CATEGORIES: BackupCategory[] = [
  {
    key: "master_data",
    labelKey: "backup.masterData",
    tables: ["divisions", "cost_categories", "funding_sources", "budget_periods"],
  },
  {
    key: "users",
    labelKey: "backup.users",
    tables: ["profiles", "user_roles"],
  },
  {
    key: "transactions",
    labelKey: "backup.transactions",
    tables: ["requests", "request_events", "request_attachments", "cash_advances", "cash_advance_items", "cash_advance_events", "cash_advance_settlements", "cash_advance_settlement_items", "medical_claims", "medical_claim_events", "medical_claim_attachments"],
  },
  {
    key: "budget_finance",
    labelKey: "backup.budgetFinance",
    tables: ["division_budgets", "budget_movements", "budget_ledger", "budget_transfers", "petty_cash_transactions", "cash_reconciliations", "employee_medical_budgets", "medical_ledger"],
  },
  {
    key: "settings",
    labelKey: "backup.settings",
    tables: ["document_templates", "document_sequences", "notification_preferences", "notification_logs"],
  },
  {
    key: "audit",
    labelKey: "backup.auditLogs",
    tables: ["audit_logs", "adjustments"],
  },
];

const BackupRestore = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    BACKUP_CATEGORIES.map((c) => c.key)
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [exportFormat, setExportFormat] = useState<"json" | "xlsx">("json");

  // Auto backup settings
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupSchedule, setAutoBackupSchedule] = useState<"daily" | "weekly" | "monthly">("daily");
  const [autoBackupRetention, setAutoBackupRetention] = useState<number>(7);
  const [isSavingAutoBackup, setIsSavingAutoBackup] = useState(false);
  const [lastAutoBackup, setLastAutoBackup] = useState<string | null>(null);

  // Load auto backup settings from app_settings or localStorage
  useEffect(() => {
    const saved = localStorage.getItem("autoBackupSettings");
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        setAutoBackupEnabled(settings.enabled ?? false);
        setAutoBackupSchedule(settings.schedule ?? "daily");
        setAutoBackupRetention(settings.retention ?? 7);
        setLastAutoBackup(settings.lastRun ?? null);
      } catch {}
    }
  }, []);

  const handleSaveAutoBackupSettings = async () => {
    setIsSavingAutoBackup(true);
    try {
      const settings = {
        enabled: autoBackupEnabled,
        schedule: autoBackupSchedule,
        retention: autoBackupRetention,
        lastRun: lastAutoBackup,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem("autoBackupSettings", JSON.stringify(settings));

      // Audit log
      await supabase.from("audit_logs").insert({
        event_type: "auto_backup_settings",
        entity_type: "system",
        description: `Auto backup settings updated - ${autoBackupEnabled ? "enabled" : "disabled"}, schedule: ${autoBackupSchedule}`,
        user_id: user?.id,
        metadata: settings as any,
      });

      toast.success(t("backup.autoBackupSaved"));
    } catch (err: any) {
      toast.error(t("backup.autoBackupError"));
    } finally {
      setIsSavingAutoBackup(false);
    }
  };

  const getNextScheduledDate = () => {
    const now = new Date();
    switch (autoBackupSchedule) {
      case "daily": {
        const next = new Date(now);
        next.setDate(next.getDate() + 1);
        next.setHours(2, 0, 0, 0);
        return next.toLocaleString();
      }
      case "weekly": {
        const next = new Date(now);
        const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
        next.setDate(next.getDate() + daysUntilMonday);
        next.setHours(2, 0, 0, 0);
        return next.toLocaleString();
      }
      case "monthly": {
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 2, 0, 0);
        return next.toLocaleString();
      }
    }
  };
  const toggleCategory = (key: string) => {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => setSelectedCategories(BACKUP_CATEGORIES.map((c) => c.key));
  const deselectAll = () => setSelectedCategories([]);

  const fetchTableData = async (tableName: string) => {
    // Use paginated fetching to handle >1000 rows
    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(tableName as any)
        .select("*")
        .range(from, from + pageSize - 1);

      if (error) {
        console.error(`Error fetching ${tableName}:`, error);
        return { error: error.message, data: [] };
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  };

  const handleExportJSON = async () => {
    if (selectedCategories.length === 0) {
      toast.error(t("backup.selectAtLeastOne"));
      return;
    }

    setIsExporting(true);
    try {
      const backupData: Record<string, any> = {
        _meta: {
          version: "1.0",
          exported_at: new Date().toISOString(),
          exported_by: user?.email || "unknown",
          format: "json",
          app: "Kemika Budget System",
        },
      };

      const selectedTables = BACKUP_CATEGORIES.filter((c) =>
        selectedCategories.includes(c.key)
      ).flatMap((c) => c.tables);

      for (const table of selectedTables) {
        const result = await fetchTableData(table);
        if (result.error) {
          toast.error(`${t("backup.errorFetching")} ${table}: ${result.error}`);
          continue;
        }
        backupData[table] = result.data;
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_kemika_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(t("backup.exportSuccess"));

      // Audit log
      await supabase.from("audit_logs").insert({
        event_type: "backup_export",
        entity_type: "system",
        description: `Manual backup exported (JSON) - ${selectedTables.length} tables`,
        user_id: user?.id,
        metadata: { tables: selectedTables, format: "json" },
      });
    } catch (err: any) {
      toast.error(t("backup.exportError") + ": " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (selectedCategories.length === 0) {
      toast.error(t("backup.selectAtLeastOne"));
      return;
    }

    setIsExporting(true);
    try {
      const selectedTables = BACKUP_CATEGORIES.filter((c) =>
        selectedCategories.includes(c.key)
      ).flatMap((c) => c.tables);

      // Build CSV files per table and zip them conceptually as separate downloads
      // For simplicity, we create a single CSV with all tables separated by headers
      let csvContent = "";

      for (const table of selectedTables) {
        const result = await fetchTableData(table);
        if (result.error || !result.data || result.data.length === 0) continue;

        const headers = Object.keys(result.data[0]);
        csvContent += `\n=== ${table.toUpperCase()} ===\n`;
        csvContent += headers.join(",") + "\n";
        for (const row of result.data) {
          csvContent +=
            headers
              .map((h) => csvCell(row[h]))
              .join(",") + "\n";
        }
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_kemika_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(t("backup.exportSuccess"));

      await supabase.from("audit_logs").insert({
        event_type: "backup_export",
        entity_type: "system",
        description: `Manual backup exported (CSV) - ${selectedTables.length} tables`,
        user_id: user?.id,
        metadata: { tables: selectedTables, format: "csv" },
      });
    } catch (err: any) {
      toast.error(t("backup.exportError") + ": " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast.error(t("backup.jsonOnly"));
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error(t("backup.fileTooLarge"));
      return;
    }

    setRestoreFile(file);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data._meta) {
        toast.error(t("backup.invalidBackupFile"));
        setRestoreFile(null);
        return;
      }

      const tables = Object.keys(data).filter((k) => k !== "_meta");
      const preview = {
        meta: data._meta,
        tables: tables.map((t) => ({
          name: t,
          count: Array.isArray(data[t]) ? data[t].length : 0,
        })),
      };
      setRestorePreview(preview);
    } catch {
      toast.error(t("backup.invalidJSON"));
      setRestoreFile(null);
      setRestorePreview(null);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile || !restorePreview) return;

    const confirmed = window.confirm(t("backup.restoreConfirm"));
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const text = await restoreFile.text();
      const data = JSON.parse(text);
      const tables = Object.keys(data).filter((k) => k !== "_meta");

      let successCount = 0;
      let errorCount = 0;

      for (const table of tables) {
        if (!Array.isArray(data[table]) || data[table].length === 0) continue;

        const { error } = await supabase.from(table as any).upsert(data[table], {
          onConflict: "id",
          ignoreDuplicates: false,
        });

        if (error) {
          console.error(`Restore error on ${table}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        event_type: "backup_restore",
        entity_type: "system",
        description: `Data restored from backup - ${successCount} tables success, ${errorCount} errors`,
        user_id: user?.id,
        metadata: {
          file_name: restoreFile.name,
          tables_restored: successCount,
          tables_failed: errorCount,
          original_export: data._meta,
        },
      });

      if (errorCount === 0) {
        toast.success(t("backup.restoreSuccess"));
      } else {
        toast.warning(
          `${t("backup.restorePartial")}: ${successCount} ${t("backup.tablesSuccess")}, ${errorCount} ${t("backup.tablesError")}`
        );
      }

      setRestoreFile(null);
      setRestorePreview(null);
    } catch (err: any) {
      toast.error(t("backup.restoreError") + ": " + err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("backup.title")}</h1>
        <p className="text-muted-foreground">{t("backup.description")}</p>
      </div>

      {/* Manual Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t("backup.manualBackup")}
          </CardTitle>
          <CardDescription>{t("backup.manualBackupDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t("backup.selectData")}</Label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {t("backup.selectAll")}
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAll}>
                {t("backup.deselectAll")}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BACKUP_CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleCategory(cat.key)}
              >
                <Checkbox
                  checked={selectedCategories.includes(cat.key)}
                  onCheckedChange={() => toggleCategory(cat.key)}
                />
                <div className="flex-1">
                  <Label className="text-sm font-medium cursor-pointer">
                    {t(cat.labelKey)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {cat.tables.length} {t("backup.tables")}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleExportJSON}
              disabled={isExporting || selectedCategories.length === 0}
              className="flex-1"
            >
              {isExporting && exportFormat === "json" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4 mr-2" />
              )}
              {t("backup.downloadJSON")}
            </Button>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={isExporting || selectedCategories.length === 0}
              className="flex-1"
            >
              {isExporting && exportFormat === "xlsx" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              {t("backup.downloadCSV")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automatic Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            {t("backup.autoBackup")}
          </CardTitle>
          <CardDescription>{t("backup.autoBackupDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5 flex-1">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">{t("backup.enableAutoBackup")}</Label>
                <Badge variant={autoBackupEnabled ? "default" : "secondary"}>
                  {autoBackupEnabled ? t("backup.active") : t("backup.inactive")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("backup.enableAutoBackupDesc")}
              </p>
            </div>
            <Switch
              checked={autoBackupEnabled}
              onCheckedChange={setAutoBackupEnabled}
            />
          </div>

          {autoBackupEnabled && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              {/* Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t("backup.schedule")}
                  </Label>
                  <Select value={autoBackupSchedule} onValueChange={(v) => setAutoBackupSchedule(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">{t("backup.daily")}</SelectItem>
                      <SelectItem value="weekly">{t("backup.weekly")}</SelectItem>
                      <SelectItem value="monthly">{t("backup.monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {t("backup.retention")}
                  </Label>
                  <Select value={String(autoBackupRetention)} onValueChange={(v) => setAutoBackupRetention(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">{t("backup.retentionDays").replace("{n}", "3")}</SelectItem>
                      <SelectItem value="7">{t("backup.retentionDays").replace("{n}", "7")}</SelectItem>
                      <SelectItem value="14">{t("backup.retentionDays").replace("{n}", "14")}</SelectItem>
                      <SelectItem value="30">{t("backup.retentionDays").replace("{n}", "30")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("backup.retentionDesc")}</p>
                </div>
              </div>

              {/* Status Info */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">{t("backup.lastAutoBackup")}</div>
                  <div>{lastAutoBackup ? new Date(lastAutoBackup).toLocaleString() : t("backup.neverRun")}</div>
                  <div className="text-muted-foreground">{t("backup.nextScheduled")}</div>
                  <div>{getNextScheduledDate()}</div>
                  <div className="text-muted-foreground">{t("backup.selectData")}</div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5 text-primary" />
                    <span>{t("backup.includeAllData")}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSaveAutoBackupSettings}
                disabled={isSavingAutoBackup}
              >
                {isSavingAutoBackup ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                {t("action.save")}
              </Button>
            </div>
          )}

          {!autoBackupEnabled && (
            <Button
              onClick={handleSaveAutoBackupSettings}
              disabled={isSavingAutoBackup}
              variant="outline"
            >
              {isSavingAutoBackup ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              {t("action.save")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Restore Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("backup.restoreData")}
          </CardTitle>
          <CardDescription>{t("backup.restoreDataDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("backup.restoreWarning")}</AlertDescription>
          </Alert>

          <div>
            <Label>{t("backup.selectBackupFile")}</Label>
            <Input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="mt-1"
            />
          </div>

          {restorePreview && (
            <div className="space-y-3">
              <Separator />
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t("backup.fileInfo")}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">{t("backup.exportedAt")}</div>
                  <div>{new Date(restorePreview.meta.exported_at).toLocaleString()}</div>
                  <div className="text-muted-foreground">{t("backup.exportedBy")}</div>
                  <div>{restorePreview.meta.exported_by}</div>
                  <div className="text-muted-foreground">{t("backup.version")}</div>
                  <div>{restorePreview.meta.version}</div>
                </div>

                <Separator />

                <div className="text-sm font-medium">{t("backup.tablesInFile")}</div>
                <div className="flex flex-wrap gap-2">
                  {restorePreview.tables.map((tbl: any) => (
                    <Badge key={tbl.name} variant="secondary">
                      {tbl.name} ({tbl.count})
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleRestore}
                disabled={isRestoring}
                variant="destructive"
                className="w-full sm:w-auto"
              >
                {isRestoring ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {t("backup.restoreNow")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupRestore;
