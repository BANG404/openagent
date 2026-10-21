import { describe, expect, test } from "bun:test";
import { normalizeMermaidSource } from "../src/lib/streamdown/mermaidSource";

describe("Mermaid source normalization", () => {
  test("separates an inline first statement from the flowchart declaration", () => {
    for (const kind of ["flowchart", "graph"]) {
      for (const direction of ["TB", "TD", "BT", "RL", "LR"]) {
        const body = 'A["用户请求"] --> B{"请求类型判断"}\n B -->|简单任务| C["直接处理"]';
        expect(normalizeMermaidSource(`%% diagram\n\n${kind} ${direction} ${body}`)).toBe(
          `%% diagram\n\n${kind} ${direction}\n${body}`,
        );
      }
    }
  });

  test("preserves existing separators, comments, other diagrams and multiline labels", () => {
    for (const source of [
      'flowchart TD; A["Start"] --> B["End"]',
      "flowchart TD ; A --> B",
      "flowchart TD %% direction\n A --> B",
      'flowchart TD\n A["label\nflowchart LR literal label"] --> B',
      "sequenceDiagram\n A->>B: flowchart TD A --> B",
      "flowchart TDX A --> B",
      "flowchart TD",
      "",
    ])
      expect(normalizeMermaidSource(source)).toBe(source);
  });

  test("preserves valid source including punctuation and labels", () => {
    const source = `flowchart TB
    subgraph Train["AgentGym-RL: 训练范式"]
        direction TB
        T1["Qwen2.5-7B-Instruct<br/>policy π_θ"] --> T2["Agent module<br/>rationale + action"]
        T2 --> T3["Environment server<br/>WebArena / SciWorld / BabyAI ..."]
        T3 --> T4["Outcome reward r(τ) ∈ [0,1]"]
        T4 --> T5["GRPO 更新<br/>horizon h_t 渐进扩展"]
        T5 --> T1
    end

    subgraph Cap["Toolathlon: 能力评测范式"]
        direction TB
        C1["模糊指令 u"] --> C2["Agent + scaffold<br/>OpenAI Agents SDK"]
        C2 --> C3["MCP / 32 个应用<br/>604 个工具"]
        C3 --> C4["环境真实状态 s_T"]
        C4 --> C5["任务脚本验证<br/>Pass / Fail, 3 次独立运行"]
        C5 -.->|Pass@1 / Pass@3 / Pass^3| C2
    end

    subgraph Safe["AgentLAB: 安全评测范式"]
        direction TB
        S1["攻击目标 G (恶意任务)"] --> S2["Planner + Attacker<br/>LLM-orchestrated"]
        S2 --> S3["多轮 user / env / memory 注入"]
        S3 --> S4["被测 Agent<br/>GPT-5.1 / Claude-4.5 / ..."]
        S4 --> S5["Verifier + Judge<br/>评估任务是否完成"]
        S5 --> S6["ASR / T2S"]
    end

    Train --> Cap
    Cap --> Safe
    Train --> Safe`;

    expect(normalizeMermaidSource(source)).toBe(source);
  });

  test("removes only transport artifacts", () => {
    expect(normalizeMermaidSource("\uFEFFflowchart TB\r\nA --> B\u0000")).toBe(
      "flowchart TB\nA --> B",
    );
  });
});
