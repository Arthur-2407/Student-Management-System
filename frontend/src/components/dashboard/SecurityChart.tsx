import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface SecurityChartProps {
  data: any[];
  className?: string;
}

// Cast Recharts components to fix JSX type errors
const LineChartComp = LineChart as any;
const LineComp = Line as any;
const XAxisComp = XAxis as any;
const YAxisComp = YAxis as any;
const TooltipComp = Tooltip as any;
const LegendComp = Legend as any;
const CartesianGridComp = CartesianGrid as any;
const ResponsiveContainerComp = ResponsiveContainer as any;

const SecurityChart = ({ data, className = '' }: SecurityChartProps) => {
  return (
    <div className={`w-full h-80 ${className}`}>
      <ResponsiveContainerComp width="100%" height="100%">
        <LineChartComp
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGridComp strokeDasharray="3 3" />
          <XAxisComp dataKey="date" />
          <YAxisComp />
          <TooltipComp />
          <LegendComp />
          <LineComp
            type="monotone"
            dataKey="spoofAttempts"
            name="Spoof Attempts"
            stroke="#ef4444"
            activeDot={{ r: 8 }}
          />
          <LineComp
            type="monotone"
            dataKey="faceMismatches"
            name="Face Mismatches"
            stroke="#f59e0b"
          />
          <LineComp
            type="monotone"
            dataKey="geoViolations"
            name="Geo Violations"
            stroke="#3b82f6"
          />
        </LineChartComp>
      </ResponsiveContainerComp>
    </div>
  );
};

export default SecurityChart;