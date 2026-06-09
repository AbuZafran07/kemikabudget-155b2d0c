import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCashAdvance,
  useCashAdvanceItems,
  useCashAdvanceSettlementItems,
  useCreateSettlement,
  useUpdateSettlement,
  useSubmitSettlement,
} from "@/hooks/useCashAdvance";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface SettlementItemRow {
  id: string;
  description: string;
  category_id: string;
  category_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  receipt_number: string;
  receipt_date: string;
  notes: string;
}

const CashAdvanceSettlementForm = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: caId, settlementId } = useParams();
  const isEditMode = !!settlementId;

  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SettlementItemRow[]>([
    {
      id: "1",
      description: "",
      category_id: "",
      category_name: "",
      quantity: 1,
      unit_price: 0,
      amount: 0,
      receipt_number: "",
      receipt_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  ]);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: ca } = useCashAdvance(caId || "");
  const { data: caItems } = useCashAdvanceItems(caId || "");
  const { data: existingItems } = useCashAdvanceSettlementItems(settlementId || "");

  // Fetch existing settlement header for edit mode
  const { data: existingSettlement } = useQuery({
    queryKey: ["cash-advance-settlement", settlementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advance_settlements")
        .select("*")
        .eq("id", settlementId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isEditMode,
  });

  const createSettlement = useCreateSettlement();
  const updateSettlement = useUpdateSettlement();
  const submitSettlement = useSubmitSettlement();

  // Category lookup for displaying names of edited items (settlement items have no category_id stored)
  const caItemByDescription = (desc: string) =>
    caItems?.find((ci) => ci.description === desc);

  // Pre-populate items
  useEffect(() => {
    if (initialized) return;
    if (isEditMode) {
      if (existingSettlement && existingItems) {
        setNotes(existingSettlement.notes || "");
        if (existingItems.length > 0) {
          setItems(
            existingItems.map((it, idx) => {
              const ci = caItemByDescription(it.description);
              return {
                id: String(idx + 1),
                description: it.description,
                category_id: ci?.category_id || "",
                category_name: (ci as any)?.category?.name || "",
                quantity: it.quantity,
                unit_price: Number(it.unit_price),
                amount: Number(it.amount),
                receipt_number: it.receipt_number || "",
                receipt_date: it.receipt_date || format(new Date(), "yyyy-MM-dd"),
                notes: it.notes || "",
              };
            })
          );
        }
        setInitialized(true);
      }
    } else {
      if (caItems && caItems.length > 0) {
        setItems(
          caItems.map((item, index) => ({
            id: String(index + 1),
            description: item.description,
            category_id: item.category_id || "",
            category_name: (item as any).category?.name || "",
            quantity: item.quantity,
            unit_price: 0,
            amount: 0,
            receipt_number: "",
            receipt_date: format(new Date(), "yyyy-MM-dd"),
            notes: "",
          }))
        );
        setInitialized(true);
      }
    }
  }, [isEditMode, existingSettlement, existingItems, caItems, initialized]);


  const addItem = () => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        description: "",
        category_id: "",
        category_name: "",
        quantity: 1,
        unit_price: 0,
        amount: 0,
        receipt_number: "",
        receipt_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof SettlementItemRow, value: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === "quantity" || field === "unit_price") {
            updated.amount = Number(updated.quantity) * Number(updated.unit_price);
          }
          return updated;
        }
        return item;
      })
    );
  };

  const totalRealized = items.reduce((sum, item) => sum + item.amount, 0);
  const variance = (ca?.total_amount || 0) - totalRealized;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const isValid = items.some((item) => item.description.trim() && item.amount > 0);

  const persist = async () => {
    if (!isValid || !caId) return null;
    const validItems = items
      .filter((item) => item.description.trim() && item.amount > 0)
      .map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        receipt_number: item.receipt_number || undefined,
        receipt_date: item.receipt_date || undefined,
        notes: item.notes || undefined,
      }));

    if (isEditMode && settlementId) {
      await updateSettlement.mutateAsync({
        settlementId,
        notes: notes || undefined,
        items: validItems,
      });
      return { id: settlementId };
    }
    return await createSettlement.mutateAsync({
      cashAdvanceId: caId,
      notes: notes || undefined,
      items: validItems,
    });
  };

  const handleSave = async () => {
    const result = await persist();
    if (result) navigate(`/cash-advance/${caId}`);
  };

  const handleSaveAndSubmit = async () => {
    const result = await persist();
    if (result) {
      await submitSettlement.mutateAsync(result.id);
      navigate(`/cash-advance/${caId}`);
    }
  };


  if (!ca) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/cash-advance/${caId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{isEditMode ? (t("cashAdvance.editRealization") || "Edit Realisasi") : t("cashAdvance.addRealization")}</h1>
          <p className="text-muted-foreground">
            {t("cashAdvance.forCA")}: {ca.ca_number}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* CA Summary */}
          <Card>
            <CardHeader>
              <CardTitle>{t("cashAdvance.originalCA")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t("cashAdvance.totalCA")}</p>
                  <p className="text-lg font-bold">{formatCurrency(ca.total_amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("cashAdvance.purpose")}</p>
                  <p className="font-medium">{ca.purpose}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.category")}</p>
                  <p className="font-medium">{ca.category?.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settlement Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("cashAdvance.realizationItems")}</CardTitle>
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
                      <TableHead className="w-[20%]">{t("common.category")}</TableHead>
                      <TableHead className="w-[25%]">{t("cashAdvance.itemDescription")}</TableHead>
                      <TableHead className="w-[8%] text-right">{t("cashAdvance.quantity")}</TableHead>
                      <TableHead className="w-[12%] text-right">{t("cashAdvance.unitPrice")}</TableHead>
                      <TableHead className="w-[12%] text-right">{t("cashAdvance.amount")}</TableHead>
                      <TableHead className="w-[12%]">{t("cashAdvance.receiptNo")}</TableHead>
                      <TableHead className="w-[8%]">{t("cashAdvance.receiptDate")}</TableHead>
                      <TableHead className="w-[3%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {item.category_name || "-"}
                          </span>
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
                          <Input
                            placeholder="Kwitansi"
                            value={item.receipt_number}
                            onChange={(e) => updateItem(item.id, "receipt_number", e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.receipt_date}
                            onChange={(e) => updateItem(item.id, "receipt_date", e.target.value)}
                          />
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
                        {t("cashAdvance.totalRealized")}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg">
                        {formatCurrency(totalRealized)}
                      </TableCell>
                      <TableCell colSpan={3}></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>{t("common.notes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={t("cashAdvance.settlementNotesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("cashAdvance.settlementSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cashAdvance.originalCA")}</span>
                <span className="font-medium">{formatCurrency(ca.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cashAdvance.totalRealized")}</span>
                <span className="font-medium">{formatCurrency(totalRealized)}</span>
              </div>
              <div className="flex justify-between border-t pt-4">
                <span className="text-muted-foreground">{t("cashAdvance.variance")}</span>
                <span className={`font-bold text-lg ${variance > 0 ? "text-primary" : variance < 0 ? "text-destructive" : ""}`}>
                  {formatCurrency(variance)}
                </span>
              </div>
              {variance > 0 && (
                <Badge variant="outline" className="w-full justify-center text-primary">
                  {t("cashAdvance.refundRequired")}
                </Badge>
              )}
              {variance < 0 && (
                <Badge variant="outline" className="w-full justify-center text-destructive">
                  {t("cashAdvance.topUpRequired")}
                </Badge>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button
              className="w-full"
              variant="outline"
              onClick={handleSave}
              disabled={!isValid || createSettlement.isPending || updateSettlement.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {t("cashAdvance.saveAsDraft")}
            </Button>
            <Button
              className="w-full"
              onClick={() => setShowSubmitDialog(true)}
              disabled={!isValid || createSettlement.isPending || updateSettlement.isPending || submitSettlement.isPending}
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
            <AlertDialogTitle>{t("cashAdvance.confirmSubmitSettlement")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cashAdvance.confirmSubmitSettlementDesc")}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("cashAdvance.totalRealized")}:</span>
                  <span className="font-semibold">{formatCurrency(totalRealized)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t("cashAdvance.variance")}:</span>
                  <span className={`font-semibold ${variance > 0 ? "text-primary" : variance < 0 ? "text-destructive" : ""}`}>
                    {formatCurrency(variance)}
                  </span>
                </div>
              </div>
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

export default CashAdvanceSettlementForm;
