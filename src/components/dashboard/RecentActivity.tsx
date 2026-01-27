import { CheckCircle, AlertCircle, XCircle, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import StatusBadge, { RequestStatus } from "@/components/common/StatusBadge";

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  requestNumber: string;
  time: string;
}

interface RecentActivityProps {
  title: string;
  items: ActivityItem[];
  emptyMessage?: string;
  className?: string;
}

const statusIcons: Record<RequestStatus, React.ElementType> = {
  draft: Clock,
  submitted: Clock,
  under_review: AlertCircle,
  approved: CheckCircle,
  rejected: XCircle,
  paid: CheckCircle,
  partially_settled: AlertCircle,
  settled: CheckCircle,
  cancelled: XCircle,
};

const RecentActivity = ({
  title,
  items,
  emptyMessage = "Tidak ada aktivitas",
  className,
}: RecentActivityProps) => {
  return (
    <div className={cn("bg-card rounded-xl border border-border", className)}>
      <div className="p-5 border-b border-border">
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="h-12 w-12 text-success/40 mx-auto mb-3" />
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          items.map((item) => {
            const Icon = statusIcons[item.status];
            return (
              <div
                key={item.id}
                className="p-4 hover:bg-muted/30 cursor-pointer transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-lg flex-shrink-0",
                      item.status === "approved" || item.status === "paid" || item.status === "settled"
                        ? "bg-success/10 text-success"
                        : item.status === "rejected" || item.status === "cancelled"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.title}
                      </p>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {item.time}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                        {item.requestNumber}
                      </code>
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RecentActivity;
