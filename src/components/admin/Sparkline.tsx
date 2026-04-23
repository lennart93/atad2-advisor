export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
}

export function Sparkline({
  values,
  width = 80,
  height = 36,
  color = "#4f46e5",
  fillOpacity = 0.08,
}: SparklineProps) {
  if (values.length === 0) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const poly = points.join(" ");
  const fillPoly = `0,${height} ${poly} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={fillPoly} fill={color} fillOpacity={fillOpacity} stroke="none" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
