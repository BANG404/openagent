import type { AgentRole } from "$lib/types";
export interface SlashCommand {
  id: string;
  /** Lowercase command name without the leading slash. */
  name: string;
  label: string;
  description: string;
  insertText?: string;
  run?: () => void;
}

export interface DraftFileEntry {
  category: string;
  name: string;
  path: string;
  updated_at: number;
}

export interface DraftCategoryEntry {
  name: string;
  drafts: DraftFileEntry[];
}

export interface MentionCatalog {
  projectDrafts: DraftCategoryEntry[];
  globalDrafts: DraftCategoryEntry[];
  roles: AgentRole[];
}
