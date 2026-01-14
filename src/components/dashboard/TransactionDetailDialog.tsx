import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { ExternalLink, Loader2 } from "lucide-react";

interface Transaction {
  id: string;
  request_number: string;
  description: string;
  amount: number;
  status: string;
  division_name?: string;
  category_name?: string;
  created_at: string;
}

interface TransactionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  transactions: Transaction[];
  isLoading?: boolean;
  filterType?: 'category' | 'month' | 'status';
  filterValue?: string;
}

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'secondary';
    case 'submitted': return 'default';
    case 'under_review': return 'default';
    case 'approved': return 'default';
    case 'rejected': return 'destructive';
    case 'paid': return 'default';
    case 'settled': return 'default';
    case 'cancelled': return 'destructive';
    default: return 'secondary';
  }
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
    paid: 'Paid',
    settled: 'Settled',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
};

const formatCurrency = (value: number) => {
  return `Rp ${value.toLocaleString("id-ID")}`;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const TransactionDetailDialog = ({
  open,
  onOpenChange,
  title,
  subtitle,
  transactions,
  isLoading = false,
}: TransactionDetailDialogProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  const handleViewRequest = (id: string) => {
    onOpenChange(false);
    navigate(`/requests?view=${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('common.noData')}
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('common.total')}</p>
                <p className="text-lg font-semibold">{transactions.length} {t('requests.title').toLowerCase()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{t('dashboard.totalBudget')}</p>
                <p className="text-lg font-semibold text-primary">{formatCurrency(totalAmount)}</p>
              </div>
            </div>

            {/* Transaction List */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="bg-card border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-muted-foreground">
                            {transaction.request_number}
                          </span>
                          <Badge variant={getStatusVariant(transaction.status)}>
                            {getStatusLabel(transaction.status)}
                          </Badge>
                        </div>
                        <p className="font-medium text-foreground truncate">
                          {transaction.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          {transaction.division_name && (
                            <span>{transaction.division_name}</span>
                          )}
                          {transaction.division_name && transaction.category_name && (
                            <span>•</span>
                          )}
                          {transaction.category_name && (
                            <span>{transaction.category_name}</span>
                          )}
                          <span>•</span>
                          <span>{formatDate(transaction.created_at)}</span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <p className="font-semibold text-foreground whitespace-nowrap">
                          {formatCurrency(transaction.amount)}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleViewRequest(transaction.id)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t('common.view')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TransactionDetailDialog;
