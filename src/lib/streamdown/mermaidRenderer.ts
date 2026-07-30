import type { MermaidConfig } from "mermaid";
import { normalizeMermaidSource } from "./mermaidSource";

export type MermaidRenderOutput = {
  svg: string;
  diagramType: string;
  width: number | null;
  height: number | null;
};

export type MermaidToolResult =
  | {
      ok: true;
      status: "rendered";
      diagram_type: string;
      width: number | null;
      height: number | null;
    }
  | {
      ok: false;
      status: "error";
      error: {
        code: "render_failed";
        message: string;
        line?: number;
        column?: number;
      };
    };

export type MermaidToolFailure = Extract<MermaidToolResult, { ok: false }>;

let mermaidModule: Promise<(typeof import("mermaid"))["default"]> | null = null;
let renderQueue: Promise<void> = Promise.resolve();
let renderSequence = 0;

export function loadMermaid() {
  mermaidModule ??= import("mermaid").then((module) => module.default);
  return mermaidModule;
}

function defaultConfig(customConfig?: MermaidConfig): MermaidConfig {
  return {
    theme: "base",
    startOnLoad: false,
    securityLevel: "strict",
    fontFamily: "monospace",
    suppressErrorRendering: true,
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: "basis",
    },
    ...(customConfig || {}),
  };
}

export function detectMermaidDiagramType(source: string): string {
  const declaration = normalizeMermaidSource(source)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
  const keyword = declaration?.split(/\s+/)[0]?.toLowerCase() ?? "unknown";
  return keyword === "graph" ? "flowchart" : keyword;
}

function svgDimensions(svg: string): { width: number | null; height: number | null } {
  const viewBox = /\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(svg);
  if (viewBox) {
    return {
      width: Number.parseFloat(viewBox[1]) || null,
      height: Number.parseFloat(viewBox[2]) || null,
    };
  }
  const width = /\bwidth=["']([\d.]+)(?:px)?["']/i.exec(svg);
  const height = /\bheight=["']([\d.]+)(?:px)?["']/i.exec(svg);
  return {
    width: width ? Number.parseFloat(width[1]) || null : null,
    height: height ? Number.parseFloat(height[1]) || null : null,
  };
}

export function renderMermaidSvg(
  source: string,
  customConfig?: MermaidConfig,
): Promise<MermaidRenderOutput> {
  const normalizedSource = normalizeMermaidSource(source);
  const run = renderQueue.then(async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize(defaultConfig(customConfig));
    renderSequence += 1;
    const uniqueId = `openagent-mermaid-${renderSequence}-${Date.now()}`;
    const { svg } = await mermaid.render(uniqueId, normalizedSource);
    const dimensions = svgDimensions(svg);
    return {
      svg,
      diagramType: detectMermaidDiagramType(normalizedSource),
      ...dimensions,
    };
  });
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function numericLocation(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function mermaidToolFailure(error: unknown): MermaidToolFailure {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const hash =
    record?.hash && typeof record.hash === "object"
      ? (record.hash as Record<string, unknown>)
      : null;
  const loc =
    hash?.loc && typeof hash.loc === "object" ? (hash.loc as Record<string, unknown>) : null;
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof record?.message === "string"
          ? record.message
          : String(error);
  const message = rawMessage.replace(/\s+$/g, "").slice(0, 1600);
  const line =
    numericLocation(loc?.first_line) ??
    numericLocation(record?.line) ??
    numericLocation(
      /line\s+(\d+)/i.exec(message)?.[1] ? Number(/line\s+(\d+)/i.exec(message)?.[1]) : undefined,
    );
  const column = numericLocation(loc?.first_column) ?? numericLocation(record?.column);

  return {
    ok: false,
    status: "error",
    error: {
      code: "render_failed",
      message,
      ...(line !== undefined ? { line } : {}),
      ...(column !== undefined ? { column } : {}),
    },
  };
}

export async function renderMermaidToolResult(
  source: string,
  customConfig?: MermaidConfig,
): Promise<MermaidToolResult> {
  try {
    const rendered = await renderMermaidSvg(source, customConfig);
    return {
      ok: true,
      status: "rendered",
      diagram_type: rendered.diagramType,
      width: rendered.width,
      height: rendered.height,
    };
  } catch (error) {
    return mermaidToolFailure(error);
  }
}
