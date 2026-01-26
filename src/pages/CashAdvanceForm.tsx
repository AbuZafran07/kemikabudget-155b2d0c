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
  CardDescription,
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
import { useCreateCashAdvance, useSubmitCashAdvance, useCashAdvance, useCashAdvanceItems } from "@/hooks/useCashAdvance";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface CashAdvanceItemRow {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  notes: string;
}

const CashAdvanceForm = () => {
  const { t } = useLanguage();
  const { divisionId, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [purpose, setPurpose] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [neededDate, setNeededDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<CashAdvanceItemRow[]>([
    { id: "1", description: "", quantity: 1, unit_price: 0, amount: 0, notes: "" },
  ]);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [savedCaId, setSavedCaId] = useState<string | null>(null);

  const createCashAdvance = useCreateCashAdvance();
  const submitCashAdvance = useSubmitCashAdvance();

  // Fetch categories with active budget allocations for user's division
  const { data: categories } = useQuery({
    queryKey: ["categories-with-budget", divisionId],
    queryFn: async () => {
      if (!divisionId) return [];

      // Get active period
      const { data: period } = await supabase
        .from("budget_periods")
        .select("id")
        .eq("is_active", true)
        .maybeSingle();

      if (!period) return [];

      // Get categories with budget allocation
      const { data, error } = await supabase
        .from("division_budgets")
        .select(`
          category_id,
          allocated_amount,
          used_amount,
          category:cost_categories(id, code, name)
        `)
        .eq("division_id", divisionId)
        .eq("period_id", period.id)
        .gt("allocated_amount", 0);

      if (error) throw error;

      return data?.map((d) => ({
        id: d.category?.id,
        code: d.category?.code,
        name: d.category?.name,
        remaining: d.allocated_amount - d.used_amount,
      })) || [];
    },
    enabled: !!divisionId,
  });

  // Load existing cash advance data if editing
  const { data: existingCa } = useCashAdvance(id || "");
  const { data: existingItems } = useCashAdvanceItems(id || "");

  useEffect(() => {
    if (isEdit && existingCa && existingItems) {
      setPurpose(existingCa.purpose);
      setCategoryId(existingCa.category_id);
      setNeededDate(existingCa.needed_date);
      setNotes(existingCa.notes || "");
      setItems(
        existingItems.map((item, index) => ({
          id: String(index + 1),
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount,
          notes: item.notes || "",
        }))
      );
    }
  }, [isEdit, existingCa, existingItems]);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        description: "",
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const isValid = purpose.trim() && categoryId && neededDate && items.some((item) => item.description.trim() && item.amount > 0);

  const handleSave = async () => {
    if (!isValid) return;

    const validItems = items.filter((item) => item.description.trim() && item.amount > 0);

    const result = await createCashAdvance.mutateAsync({
      purpose,
      category_id: categoryId,
      needed_date: neededDate,
      notes: notes || undefined,
      items: validItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        notes: item.notes || undefined,
      })),
    });

    if (result) {
      setSavedCaId(result.id);
      navigate(`/cash-advance/${result.id}`);
    }
  };

  const handleSaveAndSubmit = async () => {
    if (!isValid) return;

    const validItems = items.filter((item) => item.description.trim() && item.amount > 0);

    const result = await createCashAdvance.mutateAsync({
      purpose,
      category_id: categoryId,
      needed_date: neededDate,
      notes: notes || undefined,
      items: validItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        notes: item.notes || undefined,
      })),
    });

    if (result) {
      await submitCashAdvance.mutateAsync(result.id);
      navigate(`/cash-advance/${result.id}`);
    }
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
                  <Label>{t("common.category")} *</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("cashAdvance.selectCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id!}>
                          {cat.code} - {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      <TableHead className="w-[40%]">{t("cashAdvance.itemDescription")}</TableHead>
                      <TableHead className="w-[15%] text-right">{t("cashAdvance.quantity")}</TableHead>
                      <TableHead className="w-[20%] text-right">{t("cashAdvance.unitPrice")}</TableHead>
                      <TableHead className="w-[20%] text-right">{t("cashAdvance.amount")}</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
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
                      <TableCell colSpan={3} className="text-right font-semibold">
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
                <span className="font-medium">{items.filter((i) => i.description.trim()).length}</span>
              </div>
              <div className="flex justify-between border-t pt-4">
                <span className="text-muted-foreground">{t("cashAdvance.totalAmount")}</span>
                <span className="font-bold text-lg">{formatCurrency(totalAmount)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button
              className="w-full"
              variant="outline"
              onClick={handleSave}
              disabled={!isValid || createCashAdvance.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {t("cashAdvance.saveAsDraft")}
            </Button>
            <Button
              className="w-full"
              onClick={() => setShowSubmitDialog(true)}
              disabled={!isValid || createCashAdvance.isPending || submitCashAdvance.isPending}
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
            <AlertDialogAction onClick={handleSaveAndSubmit}>
              {t("action.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CashAdvanceForm;
