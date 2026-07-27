// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { normalizeMermaidSource } from "../src/lib/streamdown/mermaidSource";

describe("Mermaid source normalization", () => {
  test("preserves source without attempting grammar repair", () => {
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
