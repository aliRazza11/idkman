import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ReferenceDot
} from "recharts";

export default function NoiseChart({ chartPoints, scrubT, setScrubT }) {
  if (!chartPoints.length) return null;
  const latest = chartPoints[chartPoints.length - 1];
  return (
    <div className="w-full">
      <div className="text-sm font-medium text-gray-700 mb-2 text-center">
        Noise Residual (1 − cosine)
      </div>
      <div className="w-full h-56 bg-white rounded-lg border p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartPoints}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            onClick={(e) => {
              if (typeof e?.activeLabel === "number") setScrubT(e.activeLabel);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis domain={[0, 1]} />
            <Tooltip
              formatter={(v) => Number(v).toFixed(4)}
              labelFormatter={(l) => `global t = ${l}`}
            />
            <Line
              type="monotone"
              dataKey="residual"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {typeof scrubT === "number" && (
              <ReferenceLine x={scrubT} stroke="#0ea5e9" strokeDasharray="4 3" />
            )}
            {typeof scrubT === "number" && (() => {
              const p = chartPoints.find((q) => q.x === scrubT);
              return p ? <ReferenceDot x={p.x} y={p.residual} r={5} /> : null;
            })()}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-xs text-gray-500 text-center">
        Latest: global t={latest.x}, residual={latest.residual.toFixed(4)}
      </div>
    </div>
  );
}
