import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from "recharts";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface ExpenseByCategoryProps {
  data: CategoryData[];
  className?: string;
  onCategoryClick?: (categoryName: string) => void;
}

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

const ExpenseByCategory = ({ data, className, onCategoryClick }: ExpenseByCategoryProps) => {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
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

  const handlePieClick = (_: any, index: number) => {
    if (onCategoryClick && data[index]) {
      onCategoryClick(data[index].name);
    }
  };

  const handleCategoryClick = (categoryName: string) => {
    if (onCategoryClick) {
      onCategoryClick(categoryName);
    }
  };

  return (
    <div className={cn("bg-card rounded-xl border border-border p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{t('dashboard.expenseByCategory')}</h3>
        {onCategoryClick && (
          <span className="text-xs text-muted-foreground">
            {t('dashboard.clickToViewDetails')}
          </span>
        )}
      </div>
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
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
              onClick={handlePieClick}
              cursor={onCategoryClick ? "pointer" : undefined}
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
          <div
            key={index}
            className={cn(
              "flex items-center justify-between text-sm p-2 -mx-2 rounded-md transition-colors",
              onCategoryClick && "cursor-pointer hover:bg-muted/50"
            )}
            onClick={() => handleCategoryClick(item.name)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {formatValue(item.value)}
              </span>
              <span className="font-medium text-foreground">
                {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpenseByCategory;
