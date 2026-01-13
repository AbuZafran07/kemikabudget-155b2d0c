import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface ExpenseByCategoryProps {
  data: CategoryData[];
  className?: string;
}

const ExpenseByCategory = ({ data, className }: ExpenseByCategoryProps) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const formatValue = (value: number) => {
    if (value >= 1000000000) {
      return `Rp ${(value / 1000000000).toFixed(1)}M`;
    }
    if (value >= 1000000) {
      return `Rp ${(value / 1000000).toFixed(0)}jt`;
    }
    return `Rp ${value.toLocaleString("id-ID")}`;
  };

  return (
    <div className={cn("bg-card rounded-xl border border-border p-5", className)}>
      <h3 className="font-semibold text-foreground mb-4">Expense per Kategori</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatValue(value)}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "0.5rem",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 mt-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <span className="font-medium text-foreground">
              {((item.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpenseByCategory;
