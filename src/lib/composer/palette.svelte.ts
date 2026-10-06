import { fromStore } from "svelte/store";
import { t } from "$lib/i18n";
import { getMarkdownSelection } from "$lib/composerDom";
import { filterSlashCommands } from "$lib/components/slashCommandMatching";
import { applySlashCommandSelection } from "$lib/components/slashCommandSelection";
import type { PaletteItem } from "$lib/components/MentionPalette.svelte";
import type { OpenAgentClient } from "$lib/openagent/client";
import type { SlashCommand, MentionCatalog, DraftCategoryEntry } from "./types";

interface PaletteOptions {
  readonly value: string;
  readonly editorEl: HTMLDivElement | null;
  readonly slashCommands: SlashCommand[];
  readonly enableMentions: boolean;
  readonly showGlobalDraftsInMentions: boolean;
  readonly tauriAvailable: boolean;
  readonly loadMentionItems?: (query: string) => Promise<PaletteItem[]>;
  readonly client: Pick<OpenAgentClient, "invokeProduct">;
  commit(value: string, caret: number): void;
  syncPaletteAvailableHeight(): void;
  refocusEditor(): void;
}

/** Own candidate state, asynchronous catalogs, trigger replacement, and stale-result guards. */
export function createPaletteController(options: PaletteOptions) {
  const translate = fromStore(t);
  // ─── Palette state ─────────────────────────────────────────────────────────
  type Mode = "slash" | "mention";
  let paletteMode = $state<Mode | null>(null);
  let paletteQuery = $state("");
  // Caret position the trigger started at — used to compute the slice to replace.
  let triggerStart = $state(0);
  let activeIdx = $state(0);
  let mentionItems = $state<PaletteItem[]>([]);
  let mentionLoading = $state(false);
  // Token sequence guards out-of-order fetch results.
  let mentionFetchSeq = 0;
  // Drafts and roles do not depend on the query. Reuse them while the palette
  // remains open instead of issuing four IPC calls for every keystroke.
  let mentionCatalogPromise: Promise<MentionCatalog> | null = null;

  const slashPaletteItems = $derived.by<PaletteItem[]>(() => {
    if (paletteMode !== "slash") return [];
    return filterSlashCommands(options.slashCommands, paletteQuery).map((c) => ({
      id: c.id,
      label: `/${c.name}`,
      detail: c.description,
    }));
  });

  const paletteItems = $derived(paletteMode === "slash" ? slashPaletteItems : mentionItems);

  const paletteEmptyText = $derived(
    paletteMode === "slash"
      ? translate.current("paletteNoCommands")
      : mentionLoading
        ? translate.current("paletteLoadingMentions")
        : translate.current("paletteNoFiles"),
  );

  function closePalette() {
    mentionFetchSeq += 1;
    paletteMode = null;
    paletteQuery = "";
    activeIdx = 0;
    mentionItems = [];
    mentionLoading = false;
    mentionCatalogPromise = null;
  }

  // Find an active trigger (/ or @) given the caret position. Returns null if none.
  function detectTrigger(
    text: string,
    caret: number,
  ): { mode: Mode; start: number; query: string } | null {
    // Slash: only when the text begins with `/` and the caret sits inside the
    // leading command token (no whitespace between `/` and caret).
    if (text.startsWith("/")) {
      const head = text.slice(0, caret);
      if (!/\s/.test(head)) {
        return { mode: "slash", start: 0, query: head.slice(1) };
      }
    }
    if (!options.enableMentions) return null;

    // Mention: look back from the caret for the nearest `@` that is preceded by
    // start-of-text or whitespace, with no whitespace between `@` and caret.
    for (let i = caret - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === "@") {
        const prev = i === 0 ? "" : text[i - 1];
        if (prev === "" || /\s/.test(prev)) {
          return { mode: "mention", start: i, query: text.slice(i + 1, caret) };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
    }
    return null;
  }

  function loadMentionCatalog(): Promise<MentionCatalog> {
    if (!mentionCatalogPromise) {
      mentionCatalogPromise = Promise.all([
        options.client
          .invokeProduct("list_project_drafts", { scope: "local" })
          .then((drafts) => drafts as DraftCategoryEntry[])
          .catch(() => []),
        options.showGlobalDraftsInMentions
          ? options.client
              .invokeProduct("list_project_drafts", { scope: "global" })
              .then((drafts) => drafts as DraftCategoryEntry[])
              .catch(() => [])
          : Promise.resolve([]),
        options.client.invokeProduct("list_agent_roles", {}).catch(() => []),
      ]).then(([projectDrafts, globalDrafts, roles]) => ({
        projectDrafts,
        globalDrafts,
        roles,
      }));
    }
    return mentionCatalogPromise;
  }

  async function refreshMentionItems(query: string) {
    if (!options.enableMentions || (!options.tauriAvailable && !options.loadMentionItems)) {
      mentionItems = [];
      mentionLoading = false;
      return;
    }
    const seq = ++mentionFetchSeq;
    mentionLoading = true;
    try {
      if (options.loadMentionItems) {
        const items = await options.loadMentionItems(query);
        if (seq === mentionFetchSeq) mentionItems = items;
        return;
      }
      const [files, catalog] = await Promise.all([
        options.client.invokeProduct("list_workspace_files", { query }).catch(() => []),
        loadMentionCatalog(),
      ]);
      if (seq !== mentionFetchSeq) return;
      const normalizedQuery = query.trim().toLowerCase();
      const toDraftItems = (
        categories: DraftCategoryEntry[],
        scope: "项目" | "全局",
      ): PaletteItem[] => {
        return categories
          .flatMap((category) => category.drafts)
          .sort((a, b) => b.updated_at - a.updated_at || a.path.localeCompare(b.path))
          .filter((draft) => {
            if (!normalizedQuery) return true;
            const searchable =
              `草稿/${scope}/${draft.path} ${draft.name} ${draft.category}`.toLowerCase();
            return searchable.includes(normalizedQuery);
          })
          .map((draft) => ({
            id: `草稿/${scope}/${draft.path}`,
            label: draft.name,
            detail: draft.path,
            hint:
              scope === "项目"
                ? translate.current("mentionProjectDraft")
                : translate.current("mentionGlobalDraft"),
          }));
      };
      const draftItems = [
        ...toDraftItems(catalog.projectDrafts, "项目"),
        ...toDraftItems(catalog.globalDrafts, "全局"),
      ];
      const roleItems = catalog.roles
        .filter((role, index, roles) => {
          const normalizedName = role.name.toLocaleLowerCase();
          return (
            roles.findIndex(
              (candidate) => candidate.name.toLocaleLowerCase() === normalizedName,
            ) === index
          );
        })
        .filter((role) => {
          if (!normalizedQuery) return true;
          return `${role.name}\n${role.description}`.toLocaleLowerCase().includes(normalizedQuery);
        })
        .map((role) => ({
          id: `role:${role.id}`,
          insertText: role.name,
          label: role.name,
          detail: Array.from(role.description).slice(0, 50).join(""),
          hint: translate.current("mentionRole"),
        }));
      mentionItems = [
        ...roleItems,
        ...draftItems,
        ...files.map((path) => ({
          id: path,
          label: path.split("/").pop() ?? path,
          detail: path,
        })),
      ];
    } catch {
      if (seq === mentionFetchSeq) mentionItems = [];
    } finally {
      if (seq === mentionFetchSeq) mentionLoading = false;
    }
  }

  async function syncPaletteFromCaret() {
    const selection = options.editorEl ? getMarkdownSelection(options.editorEl) : null;
    if (!selection) return;
    const trigger = detectTrigger(options.value, selection.start);
    if (!trigger) {
      if (paletteMode !== null) closePalette();
      return;
    }
    const modeChanged = trigger.mode !== paletteMode;
    paletteMode = trigger.mode;
    options.syncPaletteAvailableHeight();
    triggerStart = trigger.start;
    paletteQuery = trigger.query;
    if (modeChanged) activeIdx = 0;
    if (trigger.mode === "mention") {
      await refreshMentionItems(trigger.query);
    }
  }

  function applySelection(item: PaletteItem) {
    const selection = options.editorEl ? getMarkdownSelection(options.editorEl) : null;
    const caret = selection?.start ?? options.value.length;
    if (paletteMode === "slash") {
      const cmd = options.slashCommands.find((c) => c.id === item.id);
      closePalette();
      if (cmd) {
        if (cmd.insertText) {
          const next = applySlashCommandSelection(
            options.value,
            triggerStart,
            caret,
            cmd.insertText,
          );
          options.commit(next.value, next.caret);
          options.refocusEditor();
        } else {
          options.commit("", 0);
          cmd.run?.();
        }
      }
      return;
    }

    if (paletteMode === "mention") {
      const before = options.value.slice(0, triggerStart);
      const after = options.value.slice(caret);
      // Wrap paths with whitespace in quotes so the token stays intact.
      const mention = item.insertText ?? item.id;
      const escapedMention = mention.replaceAll('"', '\\"');
      const token = /\s|"/.test(mention) ? `@"${escapedMention}"` : `@${mention}`;
      const insertion = `${token} `;
      closePalette();
      options.commit(`${before}${insertion}${after}`, before.length + insertion.length);
      options.refocusEditor();
    }
  }

  $effect(() => {
    if (paletteItems.length === 0) {
      activeIdx = 0;
    } else if (activeIdx >= paletteItems.length) {
      activeIdx = paletteItems.length - 1;
    }
  });

  return {
    get paletteMode() {
      return paletteMode;
    },
    get paletteQuery() {
      return paletteQuery;
    },
    get paletteItems() {
      return paletteItems;
    },
    get paletteEmptyText() {
      return paletteEmptyText;
    },
    get mentionLoading() {
      return mentionLoading;
    },
    get activeIdx() {
      return activeIdx;
    },
    set activeIdx(next: number) {
      activeIdx = next;
    },
    closePalette,
    syncPaletteFromCaret,
    applySelection,
  };
}
