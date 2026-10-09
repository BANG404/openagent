import type { Json, ReplayRecord } from "./types";

/** Captures remain private; independently reviewed expectations belong to cases. */
export interface CaptureAnchor {
  initial: Json;
  conversations: string[];
  subscriptions: string[];
  scope: "consumer-observed";
  idle: boolean;
  frontend_build?: string;
}

export interface CaptureManifest {
  capture_version: 1;
  target: "frontend";
  target_version: 1;
  session_id: string;
  anchor: CaptureAnchor;
  finalized: boolean;
  completeness: "complete" | "incomplete";
  reasons: string[];
  records: number;
  committed_seq: number;
  journal_bytes: number;
  journal_sha256: string;
}

export interface CaptureSink {
  /** Resolves only after the append has committed. Observation never awaits it. */
  append: (record: ReplayRecord) => Promise<void>;
}

export interface CaptureResult {
  reasons: string[];
  records: number;
  committed_seq: number;
}
