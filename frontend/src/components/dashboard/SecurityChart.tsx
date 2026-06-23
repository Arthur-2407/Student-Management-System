import * as Recharts from 'recharts';

interface SecurityChartProps {
  data: any[];
  className?: string;
}

// Cast Recharts components to fix JSX type errors
const LineChartComp = Recharts.LineChart as any;
const LineComp = Recharts.Line as any;
const XAxisComp = Recharts.XAxis as any;
const YAxisComp = Recharts.YAxis as any;
const TooltipComp = Recharts.Tooltip as any;
const LegendComp = Recharts.Legend as any;
const CartesianGridComp = Recharts.CartesianGrid as any;
const ResponsiveContainerComp = Recharts.ResponsiveContainer as any;

const SecurityChart = ({ data, className = '' }: SecurityChartProps) => {
  return (
    <div className={`w-full h-80 ${className}`}>
      <ResponsiveContainerComp width="100%" height="100%" minWidth={0} minHeight={0}>
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