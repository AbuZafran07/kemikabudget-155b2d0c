import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Send, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import MedicalAttachmentUpload from "@/components/medical/MedicalAttachmentUpload";
import {
  useMedicalBudget,
  useMedicalClaim,
  useCreateMedicalClaim,
  useUpdateMedicalClaim,
  useSubmitMedicalClaim,
} from "@/hooks/useMedicalReimbursement";

const MedicalReimbursementForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { t, language } = useLanguage();
  const { profile, user, hasRoleExact } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = hasRoleExact("super_admin");

  // Super Admin dapat membuat klaim atas nama karyawan lain
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const { data: employees = [] } = useQuery({
    queryKey: ["medical-claim-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin && !isEdit,
  });

  const { data: existingClaim, isLoading: claimLoading } = useMedicalClaim(id);
  const targetEmployeeId = isEdit ? existingClaim?.employee_id : selectedEmployeeId || user?.id;
  const isOnBehalf = !!targetEmployeeId && !!user?.id && targetEmployeeId !== user.id;
  const targetEmployeeName = isEdit
    ? existingClaim?.employee?.full_name
    : employees.find((e) => e.id === targetEmployeeId)?.full_name;
  const { data: budget, isLoading: budgetLoading } = useMedicalBudget(targetEmployeeId);
  const createMutation = useCreateMedicalClaim();
  const updateMutation = useUpdateMedicalClaim();
  const submitMutation = useSubmitMedicalClaim();

  // Query for attachments when editing
  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ["medical-claim-attachments", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("medical_claim_attachments")
        .select("*")
        .eq("claim_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const [treatmentDate, setTreatmentDate] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimType, setClaimType] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientRelationship, setPatientRelationship] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [hospitalClinic, setHospitalClinic] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [notes, setNotes] = useState("");

  // Populate form when editing
  useEffect(() => {
    if (existingClaim) {
      setTreatmentDate(existingClaim.treatment_date);
      setClaimAmount(existingClaim.claim_amount.toString());
      setClaimType(existingClaim.claim_type);
      setPatientName(existingClaim.patient_name);
      setPatientRelationship(existingClaim.patient_relationship);
      setDiagnosis(existingClaim.diagnosis || "");
      setHospitalClinic(existingClaim.hospital_clinic || "");
      setDoctorName(existingClaim.doctor_name || "");
      setNotes(existingClaim.notes || "");
    }
  }, [existingClaim]);

  // Pre-fill patient name with self
  useEffect(() => {
    if (!isEdit && profile?.full_name && !patientName) {
      setPatientName(profile.full_name);
      setPatientRelationship("self");
    }
  }, [profile, isEdit, patientName]);

  // Super Admin memilih karyawan: isi ulang nama pasien dengan nama karyawan tsb
  const handleSelectEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const emp = employees.find((e) => e.id === employeeId);
    if (emp?.full_name) {
      setPatientName(emp.full_name);
      setPatientRelationship("self");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const amount = parseFloat(claimAmount) || 0;
  const remaining = budget?.remaining_amount || 0;
  const exceedsBudget = amount > remaining;

  const isValid =
    treatmentDate &&
    amount > 0 &&
    claimType &&
    patientName.trim() &&
    patientRelationship &&
    !exceedsBudget;

  const handleSave = async () => {
    const data = {
      ...(!isEdit && isOnBehalf ? { employee_id: targetEmployeeId } : {}),
      treatment_date: treatmentDate,
      claim_amount: amount,
      claim_type: claimType,
      patient_name: patientName.trim(),
      patient_relationship: patientRelationship,
      diagnosis: diagnosis.trim() || undefined,
      hospital_clinic: hospitalClinic.trim() || undefined,
      doctor_name: doctorName.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    if (isEdit && id) {
      await updateMutation.mutateAsync({ id, data });
    } else {
      const result = await createMutation.mutateAsync(data);
      navigate(`/medical-reimbursement/${result.id}`);
    }
  };

  const handleSaveAndSubmit = async () => {
    const data = {
      ...(!isEdit && isOnBehalf ? { employee_id: targetEmployeeId } : {}),
      treatment_date: treatmentDate,
      claim_amount: amount,
      claim_type: claimType,
      patient_name: patientName.trim(),
      patient_relationship: patientRelationship,
      diagnosis: diagnosis.trim() || undefined,
      hospital_clinic: hospitalClinic.trim() || undefined,
      doctor_name: doctorName.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    let claimId = id;
    if (isEdit && id) {
      await updateMutation.mutateAsync({ id, data });
    } else {
      const result = await createMutation.mutateAsync(data);
      claimId = result.id;
    }

    if (claimId) {
      await submitMutation.mutateAsync(claimId);
      navigate(`/medical-reimbursement/${claimId}`);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSubmitting = submitMutation.isPending;

  if (isEdit && claimLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            {isEdit ? t("medical.editClaim") : t("medical.createNew")}
          </h1>
          <p className="text-muted-foreground">{t("medical.formDescription")}</p>
        </div>
      </div>

      {/* Super Admin: pilih karyawan */}
      {isSuperAdmin && !isEdit && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{language === "en" ? "Employee" : "Karyawan"}</CardTitle>
            <CardDescription>
              {language === "en"
                ? "As Super Admin you can file a medical claim on behalf of another employee. The employee's own medical budget is used."
                : "Sebagai Super Admin, Anda dapat membuat klaim medis atas nama karyawan lain. Plafon yang dipakai adalah plafon karyawan tersebut."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedEmployeeId || user?.id || ""} onValueChange={handleSelectEmployee}>
              <SelectTrigger>
                <SelectValue placeholder={language === "en" ? "Select employee" : "Pilih karyawan"} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.full_name || emp.email}
                    {emp.id === user?.id ? (language === "en" ? " (me)" : " (saya)") : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Budget Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isOnBehalf
              ? `${language === "en" ? "Medical budget" : "Plafon medis"}: ${targetEmployeeName || "-"}`
              : t("medical.yourBudget")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-sm text-muted-foreground">{t("medical.annualEntitlement")}</p>
              <p className="text-lg font-semibold">
                {budgetLoading ? "..." : formatCurrency(budget?.total_entitlement || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("medical.usedAmount")}</p>
              <p className="text-lg font-semibold text-warning">
                {budgetLoading ? "..." : formatCurrency(budget?.used_amount || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("medical.remainingBalance")}</p>
              <p className="text-lg font-semibold text-success">
                {budgetLoading ? "..." : formatCurrency(budget?.remaining_amount || 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t("medical.claimDetails")}</CardTitle>
          <CardDescription>{t("medical.claimDetailsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Treatment Date & Claim Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="treatmentDate">{t("medical.treatmentDate")} *</Label>
              <Input
                id="treatmentDate"
                type="date"
                value={treatmentDate}
                onChange={(e) => setTreatmentDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claimType">{t("medical.claimType")} *</Label>
              <Select value={claimType} onValueChange={setClaimType}>
                <SelectTrigger>
                  <SelectValue placeholder={t("medical.selectClaimType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outpatient">{t("medical.type.outpatient")}</SelectItem>
                  <SelectItem value="inpatient">{t("medical.type.inpatient")}</SelectItem>
                  <SelectItem value="dental">{t("medical.type.dental")}</SelectItem>
                  <SelectItem value="optical">{t("medical.type.optical")}</SelectItem>
                  <SelectItem value="maternity">{t("medical.type.maternity")}</SelectItem>
                  <SelectItem value="other">{t("medical.type.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Patient Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patientName">{t("medical.patientName")} *</Label>
              <Input
                id="patientName"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder={t("medical.patientNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patientRelationship">{t("medical.patientRelationship")} *</Label>
              <Select value={patientRelationship} onValueChange={setPatientRelationship}>
                <SelectTrigger>
                  <SelectValue placeholder={t("medical.selectRelationship")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">{t("medical.relationship.self")}</SelectItem>
                  <SelectItem value="spouse">{t("medical.relationship.spouse")}</SelectItem>
                  <SelectItem value="child">{t("medical.relationship.child")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Claim Amount */}
          <div className="space-y-2">
            <Label htmlFor="claimAmount">{t("medical.claimAmount")} *</Label>
            <Input
              id="claimAmount"
              type="number"
              value={claimAmount}
              onChange={(e) => setClaimAmount(e.target.value)}
              placeholder="0"
              min="0"
            />
            {exceedsBudget && (
              <Alert variant="destructive">
                <AlertDescription>{t("medical.exceedsBudgetError")}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Medical Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hospitalClinic">{t("medical.hospitalClinic")}</Label>
              <Input
                id="hospitalClinic"
                value={hospitalClinic}
                onChange={(e) => setHospitalClinic(e.target.value)}
                placeholder={t("medical.hospitalClinicPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doctorName">{t("medical.doctorName")}</Label>
              <Input
                id="doctorName"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder={t("medical.doctorNamePlaceholder")}
              />
            </div>
          </div>

          {/* Diagnosis */}
          <div className="space-y-2">
            <Label htmlFor="diagnosis">{t("medical.diagnosis")}</Label>
            <Input
              id="diagnosis"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder={t("medical.diagnosisPlaceholder")}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t("common.notes")}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("medical.notesPlaceholder")}
              rows={3}
            />
          </div>

          {/* Attachments - Only show when editing an existing claim */}
          {isEdit && id && (
            <MedicalAttachmentUpload
              claimId={id}
              attachments={attachments}
              onAttachmentsChange={() => refetchAttachments()}
              disabled={!["draft", "submitted", "review_hrga"].includes(existingClaim?.status || "")}
            />
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate(-1)} className="flex-1 sm:flex-none">
              {t("action.cancel")}
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={!isValid || isSaving}
              className="flex-1 sm:flex-none"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? t("action.saving") : t("action.save")}
            </Button>
            <Button
              onClick={handleSaveAndSubmit}
              disabled={!isValid || isSaving || isSubmitting}
              className="flex-1 sm:flex-none"
            >
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting ? t("common.processing") : t("medical.saveAndSubmit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MedicalReimbursementForm;
