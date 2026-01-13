import { useState } from "react";
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatusBadge from "@/components/common/StatusBadge";

interface ApprovalItem {
  id: string;
  number: string;
  date: string;
  division: string;
  category: string;
  description: string;
  amount: number;
  requester: string;
  submittedAt: string;
  isOverdue: boolean;
  daysPending: number;
}

const mockApprovals: ApprovalItem[] = [
  {
    id: "1",
    number: "REQ-2026-0045",
    date: "2026-01-13",
    division: "HRGA",
    category: "Transport",
    description: "Transport meeting client Surabaya",
    amount: 2500000,
    requester: "Ahmad Rizki",
    submittedAt: "2 jam lalu",
    isOverdue: false,
    daysPending: 0,
  },
  {
    id: "2",
    number: "REQ-2026-0044",
    date: "2026-01-12",
    division: "PURCHASING",
    category: "Office Supplies",
    description: "Pembelian ATK kantor bulanan",
    amount: 1850000,
    requester: "Siti Nurhaliza",
    submittedAt: "1 hari lalu",
    isOverdue: false,
    daysPending: 1,
  },
  {
    id: "3",
    number: "REQ-2026-0043",
    date: "2026-01-10",
    division: "TECH SALES",
    category: "Training",
    description: "Sertifikasi produk baru",
    amount: 15000000,
    requester: "Budi Santoso",
    submittedAt: "3 hari lalu",
    isOverdue: false,
    daysPending: 3,
  },
  {
    id: "4",
    number: "REQ-2026-0040",
    date: "2026-01-08",
    division: "MARKETING",
    category: "Entertainment",
    description: "Client entertainment Q1",
    amount: 5000000,
    requester: "Dewi Lestari",
    submittedAt: "5 hari lalu",
    isOverdue: true,
    daysPending: 5,
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

const Approvals = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");

  const filteredApprovals = mockApprovals.filter((item) => {
    const matchesSearch =
      item.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDivision =
      divisionFilter === "all" || item.division === divisionFilter;
    return matchesSearch && matchesDivision;
  });

  const overdueCount = mockApprovals.filter((a) => a.isOverdue).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Persetujuan</h1>
            <Badge className="bg-primary text-primary-foreground">
              {mockApprovals.length}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Pengajuan menunggu persetujuan Anda
          </p>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">
              {overdueCount} pengajuan melewati batas SLA
            </span>
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
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Divisi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Divisi</SelectItem>
              <SelectItem value="HRGA">HRGA</SelectItem>
              <SelectItem value="FINANCE">Finance</SelectItem>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="TECH SALES">Tech Sales</SelectItem>
              <SelectItem value="PURCHASING">Purchasing</SelectItem>
              <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
        </div>
      </div>

      {/* Approval Cards */}
      <div className="space-y-4">
        {filteredApprovals.map((item) => (
          <div
            key={item.id}
            className={`bg-card rounded-xl border p-5 transition-all hover:shadow-card-hover cursor-pointer group ${
              item.isOverdue ? "border-destructive/40" : "border-border"
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Main Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                    {item.number}
                  </code>
                  <Badge variant="outline" className="text-xs">
                    {item.division}
                  </Badge>
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
                  <span>Kategori: {item.category}</span>
                  <span>•</span>
                  <span>Oleh: {item.requester}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {item.submittedAt}
                  </span>
                </div>
              </div>

              {/* Amount */}
              <div className="text-right lg:min-w-[150px]">
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(item.amount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.daysPending} hari pending
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 lg:border-l lg:border-border lg:pl-4">
                <Button
                  variant="outline"
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                >
                  <XCircle className="h-4 w-4" />
                  Tolak
                </Button>
                <Button className="gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Setujui
                </Button>
                <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredApprovals.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <CheckCircle className="h-16 w-16 text-success/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Semua Pengajuan Sudah Diproses
          </h3>
          <p className="text-muted-foreground">
            Tidak ada pengajuan yang menunggu persetujuan Anda saat ini.
          </p>
        </div>
      )}
    </div>
  );
};

export default Approvals;
