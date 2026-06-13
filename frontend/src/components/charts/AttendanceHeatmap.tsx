import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface AttendanceData {
  date: string;
  hours: number;
  lateArrivals: number;
  [key: string]: any;
}

interface AttendanceHeatmapProps {
  data: AttendanceData[];
  className?: string;
}

const AttendanceHeatmap = (props: AttendanceHeatmapProps) => {
  const { data, className = '' } = props;

  return (
    <div className={`w-full h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          {/* @ts-ignore Recharts type incompatibility */}
          <CartesianGrid strokeDasharray="3 3" />

          {/* @ts-ignore Recharts type incompatibility */}
          <XAxis dataKey="date" />

          {/* @ts-ignore Recharts type incompatibility */}
          <YAxis />

          {/* @ts-ignore Recharts type incompatibility */}
          <Tooltip />

          {/* @ts-ignore Recharts type incompatibility */}
          <Legend />

          {/* @ts-ignore Recharts type incompatibility */}
          <Area
            type="monotone"
            dataKey="hours"
            name="Hours Worked"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.2}
          />

          {/* @ts-ignore Recharts type incompatibility */}
          <Area
            type="monotone"
            dataKey="lateArrivals"
            name="Late Arrivals"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AttendanceHeatmap;