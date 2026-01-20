import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Wallet, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface FundingSource {
  id: string;
  code: string;
  name: string;
  type: string;
  is_active: boolean;
  balance?: number;
}

interface PaymentFundingSourceSelectorProps {
  fundingSources: FundingSource[] | undefined;
  selectedFundingSourceId: string | null;
  onSelect: (id: string) => void;
  paymentAmount: number;
  disabled?: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function PaymentFundingSourceSelector({
  fundingSources,
  selectedFundingSourceId,
  onSelect,
  paymentAmount,
  disabled = false,
}: PaymentFundingSourceSelectorProps) {
  const { t, language } = useLanguage();
  const [selectedSource, setSelectedSource] = useState<FundingSource | null>(null);

  useEffect(() => {
    if (selectedFundingSourceId && fundingSources) {
      const source = fundingSources.find(fs => fs.id === selectedFundingSourceId);
      setSelectedSource(source || null);
    } else {
      setSelectedSource(null);
    }
  }, [selectedFundingSourceId, fundingSources]);

  const activeSources = fundingSources?.filter(fs => fs.is_active) || [];
  const hasInsufficientBalance = selectedSource && 
    selectedSource.balance !== undefined && 
    selectedSource.balance < paymentAmount;

  return (
    <div className="space-y-3">
      <Label htmlFor="fundingSource">
        {language === 'id' ? 'Sumber Dana' : 'Funding Source'} *
      </Label>
      <Select
        value={selectedFundingSourceId || ""}
        onValueChange={onSelect}
        disabled={disabled}
      >
        <SelectTrigger id="fundingSource">
          <SelectValue placeholder={language === 'id' ? 'Pilih sumber dana...' : 'Select funding source...'} />
        </SelectTrigger>
        <SelectContent>
          {activeSources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              <div className="flex items-center gap-2">
                {source.type === 'petty_cash' ? (
                  <Wallet className="h-4 w-4 text-success" />
                ) : (
                  <Building2 className="h-4 w-4 text-info" />
                )}
                <span>{source.name}</span>
                {source.balance !== undefined && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({formatCurrency(source.balance)})
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedSource && (
        <div className={`p-3 rounded-lg text-sm ${
          hasInsufficientBalance 
            ? 'bg-destructive/10 text-destructive border border-destructive/20' 
            : 'bg-muted/50'
        }`}>
          <div className="flex items-center gap-2">
            {selectedSource.type === 'petty_cash' ? (
              <Wallet className="h-4 w-4" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            <span className="font-medium">{selectedSource.name}</span>
          </div>
          {selectedSource.balance !== undefined && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-muted-foreground">
                {language === 'id' ? 'Saldo:' : 'Balance:'}
              </span>
              <span className={hasInsufficientBalance ? 'text-destructive font-medium' : ''}>
                {formatCurrency(selectedSource.balance)}
              </span>
              {hasInsufficientBalance && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {language === 'id' ? 'Saldo tidak mencukupi' : 'Insufficient balance'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {!selectedFundingSourceId && (
        <p className="text-xs text-warning flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {language === 'id' 
            ? 'Sumber dana harus dipilih untuk memproses pembayaran' 
            : 'Funding source must be selected to process payment'
          }
        </p>
      )}
    </div>
  );
}
