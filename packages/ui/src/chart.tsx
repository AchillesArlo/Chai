'use client';

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartProps {
  data: ChartDataPoint[];
  height?: number;
  type?: 'bar' | 'line';
  width?: number;
}

export function Chart({
  data,
  height = 200,
  type = 'bar',
  width = 400,
}: ChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No data to display
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const padding = 30;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  if (type === 'line') {
    const points = data
      .map((d, i) => {
        const x = padding + (i / Math.max(data.length - 1, 1)) * chartWidth;
        const y = height - padding - (d.value / maxValue) * chartHeight;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg
        aria-label="Line chart"
        className="rounded-xl border border-slate-200 bg-white"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <line
          stroke="#e2e8f0"
          strokeWidth="1"
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
        />
        <polyline
          fill="none"
          points={points}
          stroke="#6366f1"
          strokeWidth="2"
        />
        {data.map((d, i) => {
          const x = padding + (i / Math.max(data.length - 1, 1)) * chartWidth;
          const y = height - padding - (d.value / maxValue) * chartHeight;
          return (
            <g key={d.label}>
              <circle cx={x} cy={y} fill="#6366f1" r="3" />
              <text
                fill="#64748b"
                fontSize="10"
                textAnchor="middle"
                x={x}
                y={height - padding + 15}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // Bar chart
  const barWidth = chartWidth / data.length - 8;

  return (
    <svg
      aria-label="Bar chart"
      className="rounded-xl border border-slate-200 bg-white"
      height={height}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <line
        stroke="#e2e8f0"
        strokeWidth="1"
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
      />
      {data.map((d, i) => {
        const barHeight = (d.value / maxValue) * chartHeight;
        const x = padding + i * (barWidth + 8);
        const y = height - padding - barHeight;
        return (
          <g key={d.label}>
            <rect
              fill="#6366f1"
              height={barHeight}
              rx="3"
              width={barWidth}
              x={x}
              y={y}
            />
            <text
              fill="#64748b"
              fontSize="10"
              textAnchor="middle"
              x={x + barWidth / 2}
              y={height - padding + 15}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
