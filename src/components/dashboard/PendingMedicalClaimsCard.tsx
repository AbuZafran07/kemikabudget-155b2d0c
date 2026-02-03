import { useNavigate } from "react-router-dom";
import { Heart, ArrowRight, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";

interface MedicalClaim {
  id: string;
  claim_number: string;
  patient_name: string;
  claim_amount: number;
  status: string;
  submitted_at: string | null;
  employee?: {
    full_name: string;
  };
}

const PendingMedicalClaimsCard = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { role } = useAuth();
  
  const isHRGA = role === "admin";
  const isFinance = role === "finance";
  const isSuperAdmin = role === "super_admin";
  
  // Determine which status to filter by based on role
  const statusToFilter = isHRGA 
    ? "review_hrga" 
    : isFinance 
      ? "review_finance"
      : isSuperAdmin
        ? ["review_hrga", "review_finance", "approved"]
        : null;
  
  const { data: pendingClaims, isLoading } = useQuery({
    queryKey: ["pending-medical-claims", statusToFilter],
    queryFn: async () => {
      if (!statusToFilter) return [];
      
      let query = supabase
        .from("medical_claims")
        .select("id, claim_number, patient_name, claim_amount, status, submitted_at, employee_id")
        .order("submitted_at", { ascending: true })
        .limit(5);
      
      if (Array.isArray(statusToFilter)) {
        query = query.in("status", statusToFilter as ("review_hrga" | "review_finance" | "approved")[]);
      } else {
        query = query.eq("status", statusToFilter as "review_hrga" | "review_finance");
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch employee names
      const employeeIds = [...new Set(data?.map(c => c.employee_id).filter(Boolean))];
      const employeeMap: Record<string, { full_name: string }> = {};
      
      if (employeeIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_secure")
          .select("id, full_name")
          .in("id", employeeIds);
        
        profiles?.forEach(p => {
          if (p.id) employeeMap[p.id] = { full_name: p.full_name || "" };
        });
      }
      
      return data?.map(c => ({
        ...c,
        employee: employeeMap[c.employee_id] || null
      })) as MedicalClaim[];
    },
    enabled: !!statusToFilter,
  });
  
  // Count query for badge
  const { data: totalCount } = useQuery({
    queryKey: ["pending-medical-claims-count", statusToFilter],
    queryFn: async () => {
      if (!statusToFilter) return 0;
      
      let query = supabase
        .from("medical_claims")
        .select("id", { count: "exact", head: true });
      
      if (Array.isArray(statusToFilter)) {
        query = query.in("status", statusToFilter as ("review_hrga" | "review_finance" | "approved")[]);
      } else {
        query = query.eq("status", statusToFilter as "review_hrga" | "review_finance");
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!statusToFilter,
  });
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "review_hrga": return t("medical.statusReviewHRGA");
      case "review_finance": return t("medical.statusReviewFinance");
      case "approved": return t("status.approved");
      default: return status;
    }
  };
  
  const getCardTitle = () => {
    if (isHRGA) return t("medicalDashboard.pendingHRGA");
    if (isFinance) return t("medicalDashboard.pendingFinance");
    if (isSuperAdmin) return t("medicalDashboard.allPending");
    return t("medicalDashboard.pendingMedical");
  };
  
  if (!statusToFilter) return null;
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{getCardTitle()}</CardTitle>
          </div>
          {totalCount !== undefined && totalCount > 0 && (
            <Badge variant="destructive" className="font-bold">
              {totalCount}
            </Badge>
          )}
        </div>
        <CardDescription>{t("medicalDashboard.claimsNeedReview")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : pendingClaims?.length === 0 ? (
          <div className="text-center py-6">
            <Heart className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{t("medicalDashboard.noClaimsPending")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingClaims?.map((claim) => (
              <div
                key={claim.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                onClick={() => navigate(`/medical-reimbursement/${claim.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{claim.claim_number}</p>
                    <Badge variant="outline" className="text-xs">
                      {getStatusLabel(claim.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {claim.employee?.full_name} - {claim.patient_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-medium text-primary">
                      {formatCurrency(claim.claim_amount)}
                    </span>
                    {claim.submitted_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(claim.submitted_at), {
                          addSuffix: true,
                          locale: language === "id" ? idLocale : enUS,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            ))}
            
            {totalCount !== undefined && totalCount > 5 && (
              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={() => navigate("/medical-reimbursement")}
              >
                {t("medicalDashboard.viewAll")} ({totalCount})
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PendingMedicalClaimsCard;
