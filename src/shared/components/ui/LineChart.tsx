import ReactECharts from "echarts-for-react";
import type { ReadingPoint } from "@appTypes/device.types";

interface LineChartProps {
  data: ReadingPoint[];
  unit?: string;
  color?: string;
  height?: number;
}

export const LineChart = ({ data, unit = "", color = "#6366f1", height = 200 }: LineChartProps) => {
  const times = data.map((p) => {
    const d = new Date(p.timestamp);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  });
  const values = data.map((p) => p.value);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#ffffff",
      borderColor: "#e0e4e5",
      textStyle: { color: "#003324", fontSize: 12 },
      formatter: (params: { value: number; name: string }[]) => {
        const p = params[0];
        return `<div class="text-xs"><span class="font-medium">${p.name}</span><br/><span style="color:${color}">${p.value} ${unit}</span></div>`;
      },
    },
    grid: { left: 12, right: 12, top: 8, bottom: 20, containLabel: true },
    xAxis: {
      type: "category",
      data: times,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#8a9597",
        fontSize: 10,
        interval: Math.floor(times.length / 6),
      },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "#e0e4e5", type: "dashed" } },
      axisLabel: { color: "#8a9597", fontSize: 10, formatter: `{value} ${unit}` },
    },
    series: [
      {
        type: "line",
        data: values,
        smooth: true,
        symbol: "none",
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${color}40` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height }} />;
};
