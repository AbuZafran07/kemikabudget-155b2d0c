import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface MonthlyData {
  month: string;
  budget: number;
  actual: number;
  commitment: number;
}

interface BudgetChartProps {
  data: MonthlyData[];
  className?: string;
  onBarClick?: (month: string, dataType: 'budget' | 'actual' | 'commitment') => void;
}

const BudgetChart = ({ data, className, onBarClick }: BudgetChartProps) => {
  const { t } = useLanguage();
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(0)}jt`;
    }
    return value.toLocaleString("id-ID");
  };

  const handleBarClick = (data: any, dataKey: string) => {
    if (onBarClick && data?.month) {
      onBarClick(data.month, dataKey as 'budget' | 'actual' | 'commitment');
    }
  };

  return (
    <div className={cn("bg-card rounded-xl border border-border p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">
          Budget vs Actual vs Commitment
        </h3>
        {onBarClick && (
          <span className="text-xs text-muted-foreground">
            {t('dashboard.clickToViewDetails')}
          </span>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(var(--border))"
            />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={formatValue}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number) => `Rp ${value.toLocaleString("id-ID")}`}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "0.5rem",
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend
              wrapperStyle={{ paddingTop: "1rem" }}
              formatter={(value) => (
                <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
                  {value}
                </span>
              )}
            />
            <Bar
              dataKey="budget"
              name="Budget"
              fill="hsl(var(--chart-1))"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              cursor={onBarClick ? "pointer" : undefined}
              onClick={(data) => handleBarClick(data, 'budget')}
            />
            <Bar
              dataKey="actual"
              name="Actual"
              fill="hsl(var(--chart-2))"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              cursor={onBarClick ? "pointer" : undefined}
              onClick={(data) => handleBarClick(data, 'actual')}
            />
            <Bar
              dataKey="commitment"
              name="Commitment"
              fill="hsl(var(--chart-3))"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              cursor={onBarClick ? "pointer" : undefined}
              onClick={(data) => handleBarClick(data, 'commitment')}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BudgetChart;
