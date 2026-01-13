import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Eye,
  Edit2,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StatusBadge, { RequestStatus } from "@/components/common/StatusBadge";

interface Request {
  id: string;
  number: string;
  date: string;
  division: string;
  category: string;
  description: string;
  amount: number;
  fundingSource: string;
  status: RequestStatus;
  requester: string;
}

// Mock data
const mockRequests: Request[] = [
  {
    id: "1",
    number: "REQ-2026-0045",
    date: "2026-01-13",
    division: "HRGA",
    category: "Transport",
    description: "Transport meeting client Surabaya",
    amount: 2500000,
    fundingSource: "Petty Cash",
    status: "submitted",
    requester: "Ahmad Rizki",
  },
  {
    id: "2",
    number: "REQ-2026-0044",
    date: "2026-01-12",
    division: "PURCHASING",
    category: "Office Supplies",
    description: "Pembelian ATK kantor bulanan",
    amount: 1850000,
    fundingSource: "Bank BCA",
    status: "approved",
    requester: "Siti Nurhaliza",
  },
  {
    id: "3",
    number: "REQ-2026-0043",
    date: "2026-01-12",
    division: "TECH SALES",
    category: "Training",
    description: "Sertifikasi produk baru",
    amount: 15000000,
    fundingSource: "Bank Mandiri",
    status: "under_review",
    requester: "Budi Santoso",
  },
  {
    id: "4",
    number: "REQ-2026-0042",
    date: "2026-01-11",
    division: "MARKETING",
    category: "Entertainment",
    description: "Client entertainment Q1",
    amount: 5000000,
    fundingSource: "Petty Cash",
    status: "paid",
    requester: "Dewi Lestari",
  },
  {
    id: "5",
    number: "REQ-2026-0041",
    date: "2026-01-10",
    division: "FINANCE",
    category: "Utilities",
    description: "Pembayaran listrik kantor",
    amount: 8500000,
    fundingSource: "Bank BCA",
    status: "settled",
    requester: "Eko Prasetyo",
  },
  {
    id: "6",
    number: "REQ-2026-0040",
    date: "2026-01-10",
    division: "WAREHOUSE",
    category: "Maintenance",
    description: "Service forklift gudang",
    amount: 3200000,
    fundingSource: "Bank Mandiri",
    status: "rejected",
    requester: "Fajar Nugroho",
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

const Requests = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredRequests = mockRequests.filter((req) => {
    const matchesSearch =
      req.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.requester.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || req.status === statusFilter;
    const matchesDivision =
      divisionFilter === "all" || req.division === divisionFilter;
    return matchesSearch && matchesStatus && matchesDivision;
  });

  const totalItems = filteredRequests.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengajuan</h1>
          <p className="text-muted-foreground mt-1">
            Kelola semua pengajuan biaya
          </p>
        </div>
        <Button className="gap-2 shadow-primary">
          <Plus className="h-4 w-4" />
          Buat Pengajuan
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nomor, deskripsi, atau pemohon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Diajukan</SelectItem>
                <SelectItem value="under_review">Dalam Review</SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
                <SelectItem value="paid">Dibayar</SelectItem>
                <SelectItem value="settled">Selesai</SelectItem>
              </SelectContent>
            </Select>
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
              Filter Lanjutan
            </Button>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[140px]">No. Request</TableHead>
                <TableHead className="w-[100px]">Tanggal</TableHead>
                <TableHead className="w-[100px]">Divisi</TableHead>
                <TableHead className="w-[120px]">Kategori</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead className="text-right w-[150px]">Jumlah</TableHead>
                <TableHead className="w-[120px]">Sumber Dana</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRequests.map((request) => (
                <TableRow
                  key={request.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/requests/${request.id}`)}
                >
                  <TableCell>
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {request.number}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(request.date).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">{request.division}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {request.category}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[200px]">
                      <p className="truncate text-sm">{request.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        oleh {request.requester}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(request.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {request.fundingSource}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={request.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Eye className="h-4 w-4" /> Lihat Detail
                        </DropdownMenuItem>
                        {request.status === "draft" && (
                          <DropdownMenuItem className="gap-2">
                            <Edit2 className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="gap-2">
                          <Copy className="h-4 w-4" /> Duplikat
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {request.status === "draft" && (
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="h-4 w-4" /> Hapus
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Menampilkan {startIndex + 1}–{endIndex} dari {totalItems} data
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => setPageSize(Number(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="icon"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Requests;
