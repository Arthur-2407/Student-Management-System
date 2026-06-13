import {
  ResponsiveContainer,
  PieChart,
  Pie as RechartsPie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend
} from 'recharts';

interface LeaveData {
  name: string;
  value: number;
}

interface LeaveChartProps {
  data: LeaveData[];
  className?: string;
}

// ✅ FIX: Cast components to valid JSX types
const Pie = RechartsPie as unknown as React.FC<any>;
const Tooltip = RechartsTooltip as unknown as React.FC<any>;
const Legend = RechartsLegend as unknown as React.FC<any>;

const LeaveChart = ({ data, className = '' }: LeaveChartProps) => {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className={`w-full h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={true}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            nameKey="name"
            label={({ name, percent }: { name: string; percent: number }) =>
              `${name}: ${(percent * 100).toFixed(0)}%`
            }
          >
            {data.map((_: LeaveData, index: number) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>

          <Tooltip
            formatter={(value: number) => [`${value}`, 'Requests']}
          />

          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LeaveChart;