import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type RequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "paid"
  | "partially_settled"
  | "settled"
  | "cancelled";

interface StatusBadgeProps {
  status: RequestStatus;
  className?: string;
}

const statusConfig: Record<
  RequestStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-muted",
  },
  submitted: {
    label: "Diajukan",
    className: "bg-info/10 text-info border-info/20",
  },
  under_review: {
    label: "Dalam Review",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  approved: {
    label: "Disetujui",
    className: "bg-success/10 text-success border-success/20",
  },
  rejected: {
    label: "Ditolak",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  paid: {
    label: "Dibayar",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  partially_settled: {
    label: "Sebagian Selesai",
    className: "bg-info/10 text-info border-info/20",
  },
  settled: {
    label: "Selesai",
    className: "bg-accent/20 text-accent-foreground border-accent/30",
  },
  cancelled: {
    label: "Dibatalkan",
    className: "bg-muted text-muted-foreground border-muted",
  },
};

const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border",
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
};

export default StatusBadge;
