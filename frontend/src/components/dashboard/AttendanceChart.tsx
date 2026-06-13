import * as Recharts from 'recharts';

// ✅ Cast all components to valid JSX element types
const ResponsiveContainer = Recharts.ResponsiveContainer as any;
const BarChart = Recharts.BarChart as any;
const Bar = Recharts.Bar as any;
const XAxis = Recharts.XAxis as any;
const YAxis = Recharts.YAxis as any;
const CartesianGrid = Recharts.CartesianGrid as any;
const Tooltip = Recharts.Tooltip as any;
const Legend = Recharts.Legend as any;

interface AttendanceChartProps {
  data: any[];
  className?: string;
}

const AttendanceChart = ({ data, className = '' }: AttendanceChartProps) => {
  return (
    <div className={`w-full h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="present" name="Present" fill="#10b981" />
          <Bar dataKey="absent" name="Absent" fill="#ef4444" />
          <Bar dataKey="late" name="Late" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AttendanceChart;