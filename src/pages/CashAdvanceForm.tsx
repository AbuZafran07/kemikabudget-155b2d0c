import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateCashAdvance, useUpdateCashAdvance, useSubmitCashAdvance, useCashAdvance, useCashAdvanceItems } from "@/hooks/useCashAdvance";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { checkCaBudget } from "@/lib/ca-budget-validation";
import { CaBudgetSuggestions, type CaSuggestion } from "@/components/cash-advance/CaBudgetSuggestions";

interface CashAdvanceItemRow {
  id: string;
  description: string;
  category_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  notes: string;
}

interface CategoryOption {
  id: string;
  code: string;
  name: string;
  remaining: number;
}

const CashAdvanceForm = () => {
  const { t, language } = useLanguage();
  const { profile, user, hasRoleExact } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  // Executive (BOD/CEO) and Super Admin can choose any division.
  const canChooseDivision = hasRoleExact("executive") || hasRoleExact("super_admin");

  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(profile?.division_id || "");
  useEffect(() => {
    if (!selectedDivisionId && profile?.division_id) {
      setSelectedDivisionId(profile.division_id);
    }
  }, [profile?.division_id, selectedDivisionId]);

  const divisionId = selectedDivisionId;

  const [purpose, setPurpose] = useState("");
  const [neededDate, setNeededDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<CashAdvanceItemRow[]>([
    { id: "1", description: "", category_id: "", quantity: 1, unit_price: 0, amount: 0, notes: "" },
  ]);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string>();
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createCashAdvance = useCreateCashAdvance();
  const updateCashAdvance = useUpdateCashAdvance();
  const submitCashAdvance = useSubmitCashAdvance();

  // List divisions for executive/super_admin selector
  const { data: allDivisions } = useQuery({
    queryKey: ["cash-advance-form-divisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: canChooseDivision,
  });

  // Fetch selected division name
  const { data: userDivision } = useQuery({
    queryKey: ["user-division", divisionId],
    queryFn: async () => {
      if (!divisionId) return null;
      const { data, error } = await supabase
        .from("divisions")
        .select("id, name, code")
        .eq("id", divisionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!divisionId,
  });

  // Only show categories that have an allocation row in division_budgets for the
  // active period. The submit/approve RPCs require an existing division_budget row,
  // so categories without one would always fail at submit ("No active budget found").
  const { data: categories, isSuccess: budgetReady, isFetching: budgetFetching, error: budgetError, refetch: refreshBudget } = useQuery({
    queryKey: ["ca-budget-options", divisionId],
    queryFn: async () => {
      if (!divisionId) return [];
      const { data, error } = await supabase.rpc("get_ca_budget_options", { p_division_id: divisionId });
      if (error) throw error;
      return (data || []).map((row): CategoryOption => ({ id: row.id, code: row.code, name: row.name, remaining: Number(row.remaining) }));
    },
    enabled: !!divisionId,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // Load existing cash advance data if editing
  const { data: existingCa } = useCashAdvance(id || "");
  const { data: existingItems } = useCashAdvanceItems(id || "");

  useEffect(() => {
    if (isEdit && existingCa && existingItems) {
      setPurpose(existingCa.purpose);
      setNeededDate(existingCa.needed_date);
      setNotes(existingCa.notes || "");
      if (existingCa.division_id) setSelectedDivisionId(existingCa.division_id);
      setItems(
        existingItems.map((item, index) => ({
          id: String(index + 1),
          description: item.description,
          category_id: item.category_id || "",
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount,
          notes: item.notes || "",
        }))
      );
    }
  }, [isEdit, existingCa, existingItems]);

  // Guard: only draft can be edited
  useEffect(() => {
    if (isEdit && existingCa && existingCa.status !== "draft") {
      navigate(`/cash-advance/${existingCa.id}`, { replace: true });
    }
  }, [isEdit, existingCa, navigate]);


  const addItem = () => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        description: "",
        category_id: "",
        quantity: 1,
        unit_price: 0,
        amount: 0,
        notes: "",
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof CashAdvanceItemRow, value: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Recalculate amount
          if (field === "quantity" || field === "unit_price") {
            updated.amount = Number(updated.quantity) * Number(updated.unit_price);
          }
          return updated;
        }
        return item;
      })
    );
  };

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  const applySuggestion = (suggestion: CaSuggestion) => {
    if (!categories?.some((category) => category.id === suggestion.category_id)) return;
    if (suggestion.item_id && items.some((item) => item.id === suggestion.item_id)) {
      updateItem(suggestion.item_id, "category_id", suggestion.category_id);
      return;
    }
    setItems((previous) => {
      const empty = previous.find((item) => !item.description.trim() && !item.category_id && item.amount === 0);
      if (empty) return previous.map((item) => item.id === empty.id ? {...item, description: suggestion.description, category_id: suggestion.category_id} : item);
      return [...previous, {id: crypto.randomUUID(), description: suggestion.description, category_id: suggestion.category_id, quantity: 1, unit_price: 0, amount: 0, notes: ""}];
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Validation: purpose + needed date + at least one valid item
  const validItems = items.filter((item) => item.description.trim() && item.amount > 0);
  const allItemsHaveCategory = validItems.length > 0 && validItems.every((item) => item.category_id);
  const budgetCheck = checkCaBudget(items, categories || [], budgetReady && !budgetError && !budgetFetching);
  const isDraftValid = !!divisionId && !!purpose.trim() && !!neededDate && allItemsHaveCategory;
  const rowsComplete = items.every((item) => item.description.trim() && item.category_id && Number.isFinite(item.amount) && item.amount > 0 && item.quantity > 0 && item.unit_price > 0);
  const isValid = isDraftValid && rowsComplete && !budgetCheck.blocked;

  const buildPayload = () => {
    const validItems = items.filter((item) => item.description.trim() && item.amount > 0 && item.category_id);
    return {
      purpose,
      needed_date: neededDate,
      notes: notes || undefined,
      division_id: divisionId,
      items: validItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        notes: item.notes || undefined,
        category_id: item.category_id,
      })),
    };
  };

  const handleSave = async () => {
    if (!isDraftValid) return;
    const payload = buildPayload();
    setActionError("");
    try {
      const draftId = id || savedDraftId;
      if (draftId) {
        await updateCashAdvance.mutateAsync({ caId: draftId, ...payload });
        navigate(`/cash-advance/${draftId}`);
        return;
      }
      const result = await createCashAdvance.mutateAsync(payload);
      if (result) navigate(`/cash-advance/${result.id}`);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Gagal menyimpan draft"); }
  };

  const handleSaveAndSubmit = async () => {
    if (!isValid || submitting) return;
    const payload = buildPayload();
    setSubmitting(true);
    setActionError("");
    try {
      const fresh = await refreshBudget();
      if (fresh.error || checkCaBudget(items, fresh.data || [], fresh.isSuccess).blocked) throw new Error(language === "en" ? "Budget changed or is insufficient. Check availability for each post." : "Saldo berubah atau tidak cukup. Periksa anggaran tersedia pada setiap pos.");
      let draftId = id || savedDraftId;
      if (draftId) await updateCashAdvance.mutateAsync({ caId: draftId, ...payload });
      else {
        const result = await createCashAdvance.mutateAsync(payload);
        draftId = result?.id;
        setSavedDraftId(draftId);
      }
      if (!draftId) throw new Error("Draft tidak berhasil disimpan");
      await submitCashAdvance.mutateAsync(draftId);
      navigate(`/cash-advance/${draftId}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Pengajuan gagal");
      await refreshBudget();
    } finally { setSubmitting(false); setShowSubmitDialog(false); }
  };


  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cash-advance")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? t("cashAdvance.edit") : t("cashAdvance.createNewTitle")}
          </h1>
          <p className="text-muted-foreground">{t("cashAdvance.formDescription")}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("cashAdvance.requestInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("requests.division")} {canChooseDivision && "*"}</Label>
                  {canChooseDivision ? (
                    <>
                      <Select value={selectedDivisionId} onValueChange={setSelectedDivisionId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("requests.division")} />
                        </SelectTrigger>
                        <SelectContent>
                          {allDivisions?.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.code} - {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Executive/Super Admin dapat memilih divisi manapun
                      </p>
                    </>
                  ) : (
                    <>
                      <Input
                        value={userDivision ? userDivision.name : (divisionId ? t("common.loading") : t("common.notAssigned"))}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">{t("cashAdvance.divisionAutoSelected")}</p>
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("cashAdvance.neededDate")} *</Label>
                  <Input
                    type="date"
                    value={neededDate}
                    onChange={(e) => setNeededDate(e.target.value)}
                    min={format(new Date(), "yyyy-MM-dd")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("cashAdvance.purpose")} *</Label>
                <Textarea
                  placeholder={t("cashAdvance.purposePlaceholder")}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={3}
                />
                <CaBudgetSuggestions divisionId={divisionId} purpose={purpose} items={items.map((item) => ({id: item.id, description: item.description}))} onApply={applySuggestion} />
              </div>
              <div className="space-y-2">
                <Label>{t("common.notes")}</Label>
                <Textarea
                  placeholder={t("cashAdvance.notesPlaceholder")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Items Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("cashAdvance.items")}</CardTitle>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                {t("cashAdvance.addItem")}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[25%]">{t("common.category")}</TableHead>
                      <TableHead className="w-[25%]">{t("cashAdvance.itemDescription")}</TableHead>
                      <TableHead className="w-[10%] text-right">{t("cashAdvance.quantity")}</TableHead>
                      <TableHead className="w-[15%] text-right">{t("cashAdvance.unitPrice")}</TableHead>
                      <TableHead className="w-[15%] text-right">{t("cashAdvance.amount")}</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Select
                            value={item.category_id}
                            onValueChange={(value) => updateItem(item.id, "category_id", value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t("cashAdvance.selectCategory")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(!categories || categories.length === 0) && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                  {divisionId ? "Tidak ada kategori aktif" : "Pilih divisi dahulu"}
                                </div>
                              )}
                              {categories?.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id} disabled={cat.remaining <= 0}>
                                  {cat.code} - {cat.name} — sisa {formatCurrency(Math.max(cat.remaining, 0))}
                                  {cat.remaining <= 0 && " (habis)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder={t("cashAdvance.itemDescPlaceholder")}
                            value={item.description}
                            onChange={(e) => updateItem(item.id, "description", e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.unit_price}
                            onChange={(e) => updateItem(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(item.id)}
                            disabled={items.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="text-right font-semibold">
                        {t("cashAdvance.totalAmount")}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg">
                        {formatCurrency(totalAmount)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("cashAdvance.summary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cashAdvance.totalItems")}</span>
                <span className="font-medium">{items.filter((i) => i.description.trim() && i.category_id).length}</span>
              </div>
              <div className="flex justify-between border-t pt-4">
                <span className="text-muted-foreground">{t("cashAdvance.totalAmount")}</span>
                <span className="font-bold text-lg">{formatCurrency(totalAmount)}</span>
              </div>
              {(budgetFetching || !budgetReady) && !budgetError && <p className="text-sm text-muted-foreground">{language === "en" ? "Checking available budget…" : "Memeriksa anggaran tersedia…"}</p>}
              {budgetError && <p role="alert" className="text-sm text-destructive">{language === "en" ? "Budget unavailable. Submission locked." : "Saldo anggaran belum dapat dimuat. Pengajuan terkunci."}</p>}
              {budgetCheck.rows.map((row) => <div key={row.id} className="border-t pt-3 text-sm space-y-1">
                <p className="font-medium break-words">{row.name}</p>
                <p>{language === "en" ? "Needed" : "Kebutuhan"}: {formatCurrency(row.needed)}</p>
                <p>{language === "en" ? "Available" : "Tersedia"}: {formatCurrency(row.available)}</p>
                {(row.shortage > 0 || row.missing) && <p role="alert" className="font-semibold text-destructive">{row.missing ? (language === "en" ? "Post unavailable in this division." : "Pos tidak tersedia pada divisi ini.") : `${language === "en" ? "Shortage" : "Kekurangan"}: ${formatCurrency(row.shortage)}`}</p>}
              </div>)}
              {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button
              className="w-full"
              variant="outline"
              onClick={handleSave}
              disabled={!isDraftValid || submitting || createCashAdvance.isPending || updateCashAdvance.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {t("cashAdvance.saveAsDraft")}
            </Button>
            <Button
              className="w-full"
              onClick={() => setShowSubmitDialog(true)}
              disabled={!isValid || submitting || createCashAdvance.isPending || updateCashAdvance.isPending || submitCashAdvance.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {t("cashAdvance.saveAndSubmit")}
            </Button>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cashAdvance.confirmSubmit")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cashAdvance.confirmSubmitDesc")}
              <br />
              <span className="font-semibold text-foreground mt-2 block">
                {t("cashAdvance.totalAmount")}: {formatCurrency(totalAmount)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={!isValid || submitting} onClick={handleSaveAndSubmit}>
              {t("action.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CashAdvanceForm;
