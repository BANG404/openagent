import { writable, derived, get } from "svelte/store";
import { invoke, listen } from "$lib/openagent/tauriClient";
import { zh } from "./i18n.zh";
import { en } from "./i18n.en";

export type Locale = "zh" | "en";
export type TranslationKeys = keyof typeof zh;

const toolNameKeys: Partial<Record<string, TranslationKeys>> = {
  create_goal: "toolCreateGoal",
  update_goal: "toolUpdateGoal",
  create_goal_graph: "toolCreateGoalGraph",
  update_goal_graph: "toolUpdateGoalGraph",
  cancel_goal_graph: "toolCancelGoalGraph",
  delete_goal_graph: "toolDeleteGoalGraph",
  graph_read: "toolGraphRead",
  search_conversation_messages: "toolSearchConversationMessages",
  get_skill_descriptions: "toolGetSkillDescriptions",
  read_file: "toolReadFile",
  write_file: "toolWriteFile",
  edit_file: "toolEditFile",
  ls: "toolListDirectory",
  glob: "toolGlob",
  grep: "toolGrep",
  apply_patch: "toolApplyPatch",
  view_image: "toolViewImage",
  save_agent_memory: "toolSaveAgentMemory",
  search_agent_memory: "toolSearchAgentMemory",
  update_agent_memory: "toolUpdateAgentMemory",
  schedule_chat_hook: "toolScheduleChatHook",
  render_mermaid: "toolRenderMermaid",
  ask_user: "toolAskUser",
  terminal_exec: "toolTerminalExec",
  terminal_start: "toolTerminalStart",
  terminal_read: "toolTerminalRead",
  terminal_write: "toolTerminalWrite",
  terminal_kill: "toolTerminalKill",
  terminal_list: "toolTerminalList",
  exec_command: "toolExecCommand",
  write_stdin: "toolWriteStdin",
  chat_send_message: "toolChatSendMessage",
  chat_group_create: "toolChatGroupCreate",
  chat_group_add_member: "toolChatGroupAddMember",
  chat_group_list_members: "toolChatGroupListMembers",
  chat_group_send_message: "toolChatGroupSendMessage",
  chat_group_read_messages: "toolChatGroupReadMessages",
  submit_compaction_summary: "toolSubmitCompactionSummary",
  chat_group_start: "chatGroupStartTool",
  dispatch_role: "toolDispatchRole",
  create_role: "createRoleTool",
  search_roles: "searchRolesTool",
};

export const locale = writable<Locale>("zh");
export const t = derived(locale, ($locale) => (key: TranslationKeys): string => ($locale === "en" ? en : zh)[key]);
export function toolNameKey(name: string): TranslationKeys | undefined { return toolNameKeys[name]; }
export function tr(key: TranslationKeys): string { return (get(locale) === "en" ? en : zh)[key]; }
export function setLocale(newLocale: Locale): void { locale.set(newLocale); invoke("plugin:i18n|set_locale", { locale: newLocale }).catch(() => {}); }
export async function initLocale(): Promise<void> { try { const stored = await invoke<string>("plugin:i18n|get_locale"); if (stored === "zh" || stored === "en") locale.set(stored); } catch {} }
export function listenLocale(): Promise<() => void> { return listen<string>("i18n:locale-changed", (e: { payload: string }) => { const value = e.payload; if (value === "zh" || value === "en") locale.set(value); }); }
export async function initI18n(savedLanguage?: string | null): Promise<void> { let target: Locale; if (savedLanguage === "zh" || savedLanguage === "en") target = savedLanguage; else { try { const systemLocale = await invoke<string>("get_system_locale"); target = systemLocale.toLowerCase().startsWith("zh") ? "zh" : "en"; } catch { target = "zh"; } } locale.set(target); invoke("plugin:i18n|set_locale", { locale: target }).catch(() => {}); listenLocale().catch(() => {}); }
