<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from "echarts/charts";
  import type {
    GridComponentOption,
    LegendComponentOption,
    TitleComponentOption,
    TooltipComponentOption,
  } from "echarts/components";
  import type { ComposeOption, ECharts } from "echarts/core";
  import type { Value } from "../parser";
  import { observeThemePalette, readThemePalette } from "../themePalette";

  type ChartType = "bar" | "line" | "pie";
  type ChartOption = ComposeOption<
    | BarSeriesOption
    | LineSeriesOption
    | PieSeriesOption
    | GridComponentOption
    | LegendComponentOption
    | TitleComponentOption
    | TooltipComponentOption
  >;

  let {
    args,
    isDark = false,
  }: {
    args: Record<string, unknown>;
    rawArgs?: Array<[string, Value]>;
    isDark?: boolean;
  } = $props();

  let container: HTMLDivElement | null = $state(null);
  let chart: ECharts | null = null;
  let echartsModule: typeof import("../echartsRuntime") | null = null;
  let chartIsDark: boolean | null = null;
  let resizeObs: ResizeObserver | null = null;
  let themeRevision = $state(0);
  let stopThemeObserver: (() => void) | undefined;

  const type = $derived<ChartType>(args.type === "line" || args.type === "pie" ? args.type : "bar");
  const title = $derived(typeof args.title === "string" ? args.title : "");
  const labels = $derived(Array.isArray(args.labels) ? (args.labels as unknown[]).map(String) : []);
  const dataArr = $derived(Array.isArray(args.data) ? (args.data as unknown[]) : []);
  const series = $derived(Array.isArray(args.series) ? (args.series as unknown[]) : []);
  const height = $derived(
    typeof args.height === "number" ? args.height : type === "pie" ? 320 : 300,
  );

  function currentPalette(dark: boolean) {
    const fallback = dark
      ? { foreground: "#e2e8f0", "muted-foreground": "#8892a4", border: "#2d3148", card: "#1a1d27" }
      : {
          foreground: "#1d1d1f",
          "muted-foreground": "#6e6e73",
          border: "#d8d8df",
          card: "#ffffff",
        };
    return { ...fallback, ...readThemePalette() };
  }

  function buildOption(dark: boolean) {
    const palette: Record<string, string> = currentPalette(dark);
    const textColor = palette.foreground;
    const axisColor = palette["muted-foreground"];
    const gridColor = palette.border;

    // Vertical layout: [title] [legend] [chart body]
    // title sits at top:8; legend sits below it; chart grid sits below legend.
    const titleH = title ? 24 : 0; // approx title block height
    const legendH = 26; // approx legend block height
    const padTop = 8;
    const legendTop = padTop + titleH + (title ? 4 : 0);
    const bodyTop = legendTop + legendH;

    const titleOpt = title
      ? {
          text: title,
          left: "center" as const,
          top: padTop,
          textStyle: { color: textColor, fontSize: 13, fontWeight: 500 as const },
        }
      : undefined;

    const base: ChartOption = {
      color: Array.from({ length: 5 }, (_, i) => palette[`chart-${i + 1}`]).filter(Boolean),
      backgroundColor: "transparent",
      title: titleOpt,
      tooltip: { trigger: type === "pie" ? "item" : "axis", confine: true },
      legend: {
        top: legendTop,
        left: "center",
        textStyle: { color: textColor },
        itemGap: 16,
        icon: "roundRect",
      },
      grid: { left: 12, right: 16, top: bodyTop, bottom: 30, containLabel: true },
      textStyle: { color: textColor, fontFamily: palette.font },
    };

    if (type === "pie") {
      const pieData = labels.length
        ? labels.map((name, i) => ({ name, value: Number(dataArr[i] ?? 0) }))
        : (dataArr as Array<{ name: string; value: number }>);
      return {
        ...base,
        grid: undefined,
        // Hide legend for pie — outside labels already identify each slice
        legend: { show: false },
        series: [
          {
            type: "pie",
            radius: ["38%", "62%"],
            center: ["50%", title ? "58%" : "52%"],
            avoidLabelOverlap: true,
            data: pieData,
            label: { color: textColor, formatter: "{b}\n{d}%" },
            labelLine: { length: 10, length2: 8 },
            itemStyle: { borderColor: palette.card, borderWidth: 2 },
          },
        ],
      };
    }

    const xCategories = labels;
    const ser = series.length
      ? (series as Array<Record<string, unknown>>).map((s) => ({
          name: typeof s.name === "string" ? s.name : "",
          type,
          data: Array.isArray(s.data) ? (s.data as unknown[]).map(Number) : [],
          smooth: type === "line",
        }))
      : [{ name: title || "value", type, data: dataArr.map(Number), smooth: type === "line" }];

    // For single-series charts without explicit series[], hide the redundant legend
    const showLegend = series.length > 0;

    return {
      ...base,
      legend: showLegend ? base.legend : { show: false },
      grid: { ...base.grid, top: showLegend ? bodyTop : padTop + titleH + (title ? 8 : 0) },
      xAxis: {
        type: "category",
        data: xCategories,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor },
        splitLine: { lineStyle: { color: gridColor, opacity: 0.5 } },
      },
      series: ser,
    };
  }

  onMount(async () => {
    stopThemeObserver = observeThemePalette(() => themeRevision++);
    if (!container) return;
    echartsModule = await import("../echartsRuntime");
    chart = echartsModule.initializeChart(container, isDark ? "dark" : undefined, {
      renderer: "canvas",
    });
    chartIsDark = isDark;
    chart.setOption(buildOption(isDark));
    resizeObs = new ResizeObserver(() => chart?.resize());
    resizeObs.observe(container);
  });

  $effect(() => {
    void themeRevision;
    const dark = isDark;
    const option = buildOption(dark);
    if (!chart || !container || !echartsModule) return;
    if (chartIsDark !== dark) {
      chart.dispose();
      chart = echartsModule.initializeChart(container, dark ? "dark" : undefined, {
        renderer: "canvas",
      });
      chartIsDark = dark;
    }
    chart.setOption(option, true);
  });

  onDestroy(() => {
    stopThemeObserver?.();
    resizeObs?.disconnect();
    chart?.dispose();
    chart = null;
    echartsModule = null;
    chartIsDark = null;
  });
</script>

<div class="chart-card">
  <div bind:this={container} class="chart-canvas" style="height: {height}px"></div>
</div>

<style>
  .chart-card {
    margin: 12px 0;
    padding: 8px;
    border-radius: calc(var(--radius) * 0.833333);
    border: 1px solid var(--border);
    background: var(--card);
  }
  .chart-canvas {
    width: 100%;
    min-height: 200px;
  }
</style>
