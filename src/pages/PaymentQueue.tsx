import { useState } from "react";
import {
  Search,
  Filter,
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  Download,
  ChevronRight,
  Building2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaymentItem {
  id: string;
  number: string;
  date: string;
  division: string;
  category: string;
  description: string;
  amount: number;
  fundingSource: "petty_cash" | "bank_bca" | "bank_mandiri";
  requester: string;
  approvedAt: string;
  hasInvoice: boolean;
  hasQuotation: boolean;
  isOverdue: boolean;
}

const mockPayments: PaymentItem[] = [
  {
    id: "1",
    number: "REQ-2026-0040",
    date: "2026-01-10",
    division: "MARKETING",
    category: "Entertainment",
    description: "Client entertainment Q1",
    amount: 5000000,
    fundingSource: "petty_cash",
    requester: "Dewi Lestari",
    approvedAt: "1 hari lalu",
    hasInvoice: true,
    hasQuotation: true,
    isOverdue: false,
  },
  {
    id: "2",
    number: "REQ-2026-0038",
    date: "2026-01-09",
    division: "HRGA",
    category: "Maintenance",
    description: "Service AC kantor lantai 3",
    amount: 3200000,
    fundingSource: "bank_bca",
    requester: "Eko Prasetyo",
    approvedAt: "2 hari lalu",
    hasInvoice: false,
    hasQuotation: true,
    isOverdue: false,
  },
  {
    id: "3",
    number: "REQ-2026-0035",
    date: "2026-01-07",
    division: "TECH SALES",
    category: "Training",
    description: "Workshop sertifikasi AWS",
    amount: 25000000,
    fundingSource: "bank_mandiri",
    requester: "Budi Santoso",
    approvedAt: "4 hari lalu",
    hasInvoice: true,
    hasQuotation: false,
    isOverdue: true,
  },
];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const fundingSourceConfig = {
  petty_cash: { label: "Kas Kecil", icon: Wallet, color: "text-success" },
  bank_bca: { label: "Bank BCA", icon: Building2, color: "text-info" },
  bank_mandiri: { label: "Bank Mandiri", icon: Building2, color: "text-primary" },
};

const PaymentQueue = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const filteredPayments = mockPayments.filter((item) => {
    const matchesSearch =
      item.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource =
      sourceFilter === "all" || item.fundingSource === sourceFilter;
    return matchesSearch && matchesSource;
  });

  const toggleSelection = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedItems.length === filteredPayments.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredPayments.map((p) => p.id));
    }
  };

  const selectedTotal = filteredPayments
    .filter((p) => selectedItems.includes(p.id))
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">
              Antrian Pembayaran
            </h1>
            <Badge className="bg-primary text-primary-foreground">
              {mockPayments.length}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Pengajuan yang disetujui siap untuk dibayar
          </p>
        </div>
        {selectedItems.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedItems.length} dipilih • {formatCurrency(selectedTotal)}
            </span>
            <Button className="gap-2">
              <CreditCard className="h-4 w-4" />
              Batch Payment
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nomor atau deskripsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sumber Dana" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Sumber</SelectItem>
              <SelectItem value="petty_cash">Kas Kecil</SelectItem>
              <SelectItem value="bank_bca">Bank BCA</SelectItem>
              <SelectItem value="bank_mandiri">Bank Mandiri</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Payment Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <Checkbox
            checked={
              selectedItems.length === filteredPayments.length &&
              filteredPayments.length > 0
            }
            onCheckedChange={selectAll}
          />
          <span className="text-sm text-muted-foreground">Pilih Semua</span>
        </div>

        {filteredPayments.map((item) => {
          const sourceConfig = fundingSourceConfig[item.fundingSource];
          const SourceIcon = sourceConfig.icon;

          return (
            <div
              key={item.id}
              className={`bg-card rounded-xl border p-5 transition-all hover:shadow-card-hover cursor-pointer group ${
                item.isOverdue
                  ? "border-destructive/40"
                  : selectedItems.includes(item.id)
                  ? "border-primary"
                  : "border-border"
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Checkbox */}
                <Checkbox
                  checked={selectedItems.includes(item.id)}
                  onCheckedChange={() => toggleSelection(item.id)}
                  className="self-start lg:self-center"
                />

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {item.number}
                    </code>
                    <Badge variant="outline" className="text-xs">
                      {item.division}
                    </Badge>
                    <div className={`flex items-center gap-1 ${sourceConfig.color}`}>
                      <SourceIcon className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">
                        {sourceConfig.label}
                      </span>
                    </div>
                    {item.isOverdue && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {item.description}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Oleh: {item.requester}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      Approved {item.approvedAt}
                    </span>
                  </div>

                  {/* Document Checklist */}
                  <div className="flex items-center gap-4 mt-3">
                    <div
                      className={`flex items-center gap-1.5 text-xs ${
                        item.hasInvoice ? "text-success" : "text-warning"
                      }`}
                    >
                      {item.hasInvoice ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      Invoice
                    </div>
                    <div
                      className={`flex items-center gap-1.5 text-xs ${
                        item.hasQuotation ? "text-success" : "text-warning"
                      }`}
                    >
                      {item.hasQuotation ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      Quotation
                    </div>
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right lg:min-w-[150px]">
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(item.amount)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 lg:border-l lg:border-border lg:pl-4">
                  <Button className="gap-2">
                    <CreditCard className="h-4 w-4" />
                    Bayar
                  </Button>
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPayments.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <CheckCircle className="h-16 w-16 text-success/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Tidak Ada Pembayaran Menunggu
          </h3>
          <p className="text-muted-foreground">
            Semua pembayaran sudah diproses.
          </p>
        </div>
      )}
    </div>
  );
};

export default PaymentQueue;
