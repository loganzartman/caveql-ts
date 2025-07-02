import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";
import { impossible } from "../../src/impossible";

export function ResultsChart({
  type,
  results,
}: {
  type: "bar";
  results: Record<string, unknown>[];
}) {
  const keys = useMemo(
    () => [...new Set(Object.values(results).flatMap(Object.keys))],
    [results],
  );
  const xAxisKey = useMemo(() => keys[0], [keys]);
  const barKeys = useMemo(() => keys.slice(1), [keys]);

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={results}>
          <XAxis dataKey={xAxisKey} />
          {barKeys.map((key) => (
            <Bar key={key} className="fill-amber-400" dataKey={key} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  impossible(type);
}
