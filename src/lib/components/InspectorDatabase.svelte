<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { onMount } from "svelte";
  import InspectorJsonValue from "$lib/components/InspectorJsonValue.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";

  type TableSummary = { name: string; row_count: number; column_count: number };
  type Column = {
    cid: number;
    name: string;
    data_type: string;
    not_null: boolean;
    default_value: string | null;
    primary_key: boolean;
  };
  type Overview = { path: string; tables: TableSummary[] };
  type TableData = {
    table: string;
    columns: Column[];
    rows: string[][];
    total_rows: number;
    offset: number;
    limit: number;
    sort_column: string | null;
    sort_direction: "asc" | "desc" | null;
  };

  const PAGE_SIZE = 50;
  const SELECTED_TABLE_STORAGE_PREFIX = "openagent.dev-inspector.database.selected-table:";

  let overview = $state<Overview | null>(null);
  let selectedTable = $state<string | null>(null);
  let tableData = $state<TableData | null>(null);
  let searchInput = $state("");
  let activeSearch = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let selectedCell = $state<{ rowIndex: number; columnIndex: number } | null>(null);
  let sortColumn = $state<string | null>(null);
  let sortDirection = $state<"asc" | "desc">("asc");
  let cellSearch = $state("");

  const selectedSummary = $derived(overview?.tables.find((table) => table.name === selectedTable) ?? null);
  const pageStart = $derived(tableData && tableData.total_rows ? tableData.offset + 1 : 0);
  const pageEnd = $derived(tableData ? Math.min(tableData.offset + tableData.rows.length, tableData.total_rows) : 0);
  const selectedColumn = $derived(selectedCell && tableData ? tableData.columns[selectedCell.columnIndex] ?? null : null);
  const selectedValue = $derived(selectedCell && tableData ? tableData.rows[selectedCell.rowIndex]?.[selectedCell.columnIndex] ?? "" : "");
  const selectedJson = $derived(parseJson(selectedValue));
  const checkpointMessages = $derived(getCheckpointMessages(selectedJson));
  const filteredCheckpointMessages = $derived(checkpointMessages?.filter((message) => checkpointMessageSearchText(message).includes(cellSearch.trim().toLocaleLowerCase())) ?? []);

  function selectedTableStorageKey(path: string) {
    return `${SELECTED_TABLE_STORAGE_PREFIX}${path}`;
  }

  function readSavedTable(path: string): string | null {
    try {
      return window.localStorage.getItem(selectedTableStorageKey(path));
    } catch {
      return null;
    }
  }

  function persistSelectedTable(tableName: string) {
    if (!overview) return;
    try {
      window.localStorage.setItem(selectedTableStorageKey(overview.path), tableName);
    } catch {
      // The inspector remains usable when browser storage is unavailable.
    }
  }

  async function loadOverview() {
    loading = true;
    error = null;
    try {
      overview = await invoke<Overview>("inspector_database_overview");
      const savedTable = readSavedTable(overview.path);
      const nextTable = savedTable && overview.tables.some((table) => table.name === savedTable)
        ? savedTable
        : selectedTable && overview.tables.some((table) => table.name === selectedTable)
        ? selectedTable
        : overview.tables[0]?.name ?? null;
      if (nextTable) await selectTable(nextTable);
      else tableData = null;
    } catch (cause) {
      error = String(cause);
    } finally {
      loading = false;
    }
  }

  async function loadTable(offset = 0) {
    if (!selectedTable) return;
    selectedCell = null;
    loading = true;
    error = null;
    try {
      const data = await invoke<TableData>("inspector_table_data", {
        tableName: selectedTable,
        search: activeSearch || null,
        sortColumn,
        sortDirection: sortColumn ? sortDirection : null,
        offset,
        limit: PAGE_SIZE,
      });
      tableData = data;
      if (data.sort_column && data.sort_direction) {
        sortColumn = data.sort_column;
        sortDirection = data.sort_direction;
      }
    } catch (cause) {
      error = String(cause);
    } finally {
      loading = false;
    }
  }

  async function selectTable(tableName: string) {
    selectedTable = tableName;
    persistSelectedTable(tableName);
    selectedCell = null;
    searchInput = "";
    activeSearch = "";
    sortColumn = null;
    sortDirection = "desc";
    await loadTable(0);
  }

  async function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    activeSearch = searchInput.trim();
    await loadTable(0);
  }

  async function clearSearch() {
    searchInput = "";
    activeSearch = "";
    await loadTable(0);
  }

  function previousPage() {
    if (tableData) void loadTable(Math.max(0, tableData.offset - PAGE_SIZE));
  }

  function nextPage() {
    if (tableData) void loadTable(tableData.offset + PAGE_SIZE);
  }

  function selectCell(rowIndex: number, columnIndex: number) {
    selectedCell = { rowIndex, columnIndex };
    cellSearch = "";
  }

  function toggleSort(columnName: string) {
    if (sortColumn === columnName) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortColumn = columnName;
      sortDirection = "asc";
    }
    void loadTable(0);
  }

  function parseJson(value: string): unknown | null {
    try {
      let parsed: unknown = JSON.parse(value);
      // Checkpoints can contain JSON serialized inside a TEXT column. Unwrap a
      // bounded number of nested encodings so escaped newlines stay readable.
      for (let attempts = 0; attempts < 3 && typeof parsed === "string"; attempts += 1) {
        try { parsed = JSON.parse(parsed); } catch { break; }
      }
      return parsed;
    } catch { return null; }
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function getCheckpointMessages(value: unknown): Record<string, unknown>[] | null {
    if (!isRecord(value) || !Array.isArray(value.messages)) return null;
    return value.messages.filter(isRecord);
  }

  function checkpointContentType(message: Record<string, unknown>): string {
    if (!Array.isArray(message.content)) return "unknown";
    const types = message.content
      .filter(isRecord)
      .map((content) => typeof content.type === "string" ? content.type : "unknown");
    return types.join(" + ") || "unknown";
  }

  function checkpointContentText(content: unknown): string {
    if (Array.isArray(content)) return content.map(checkpointContentText).join(" ");
    if (!isRecord(content)) return typeof content === "string" ? content : JSON.stringify(content ?? "");
    for (const key of ["text", "content", "name", "input"]) {
      if (key in content) {
        const value = content[key];
        return typeof value === "string" ? value : JSON.stringify(value);
      }
    }
    return JSON.stringify(content);
  }

  function checkpointMessageSearchText(message: Record<string, unknown>): string {
    return [message.role, checkpointContentType(message), checkpointContentText(message.content), JSON.stringify(message)]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLocaleLowerCase();
  }

  function contentPreview(content: unknown): string {
    return checkpointContentText(content).replace(/\s+/g, " ").slice(0, 240);
  }

  function timestampDisplay(value: string, columnName: string): string | null {
    if (!/(?:^|_)(?:created|updated|accessed|confirmed)_at$/i.test(columnName) || !/^\d+$/.test(value)) return null;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds) || seconds < 946684800 || seconds > 4102444800) return null;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(seconds * 1000));
  }

  function cellPreview(value: string, columnName = ""): string {
    if (value === "NULL") return value;
    const timestamp = timestampDisplay(value, columnName);
    if (timestamp) return timestamp;
    const parsed = parseJson(value);
    if (Array.isArray(parsed)) return `[JSON array · ${parsed.length}]`;
    if (parsed && typeof parsed === "object") return `{JSON object · ${Object.keys(parsed).length}}`;
    return value.replace(/\s+/g, " ").slice(0, 160);
  }

  onMount(loadOverview);
</script>

<section class:detail-open={selectedCell !== null} class="database-view" aria-label="Database browser">
  <aside class="table-sidebar">
    <div class="panel-heading">
      <div><p class="eyebrow">SQLITE TABLES</p><h2>{overview?.tables.length ?? 0} tables</h2></div>
      <button onclick={loadOverview} disabled={loading}>Refresh</button>
    </div>
    {#if overview}<p class="database-path" title={overview.path}>{overview.path}</p>{/if}
    <div class="table-list">
      {#if loading && !overview}
        <LoadingSkeleton variant="detail-list" rows={6} label="Loading database tables" />
      {:else}
        {#each overview?.tables ?? [] as table (table.name)}
        <button class:active={selectedTable === table.name} onclick={() => selectTable(table.name)}>
          <strong>{table.name}</strong>
          <span>{table.row_count.toLocaleString()} rows · {table.column_count} fields</span>
        </button>
        {:else}{#if !loading}<p class="muted empty">No application tables found.</p>{/if}{/each}
      {/if}
    </div>
  </aside>

  <section class="data-panel">
    <div class="data-heading">
      <div>
        <p class="eyebrow">READ-ONLY DATABASE</p>
        <h2>{selectedTable ?? "Select a table"}</h2>
        <p class="muted">{selectedSummary ? `${selectedSummary.row_count.toLocaleString()} total rows` : "Browse persisted application data and schema"}</p>
      </div>
      <form role="search" onsubmit={submitSearch}>
        <input bind:value={searchInput} aria-label="Search selected table" placeholder="Search all fields…" disabled={!selectedTable || loading} />
        {#if activeSearch}<button type="button" onclick={clearSearch} disabled={loading}>Clear</button>{/if}
        <button type="submit" disabled={!selectedTable || loading}>Search</button>
      </form>
    </div>

    {#if error}<p class="error">{error}</p>{/if}
    {#if loading}
      <LoadingSkeleton variant="table" rows={10} label="Loading database rows" />
    {:else if tableData}
      <details class="schema" open>
        <summary>Fields <span>{tableData.columns.length}</span></summary>
        <div class="schema-grid">
          {#each tableData.columns as column (column.cid)}
            <article>
              <div><code>{column.name}</code>{#if column.primary_key}<span class="badge">PK</span>{/if}{#if column.not_null}<span class="badge">NOT NULL</span>{/if}</div>
              <span>{column.data_type || "untyped"}{column.default_value === null ? "" : ` · default ${column.default_value}`}</span>
            </article>
          {/each}
        </div>
      </details>

      <div class="result-meta">
        <span>{activeSearch ? `${tableData.total_rows.toLocaleString()} matches for “${activeSearch}”` : `${tableData.total_rows.toLocaleString()} rows`}</span>
        <span>{pageStart.toLocaleString()}–{pageEnd.toLocaleString()}</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>{#each tableData.columns as column (column.cid)}<th title={column.data_type} aria-sort={sortColumn === column.name ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}><button class:active-sort={sortColumn === column.name} onclick={() => toggleSort(column.name)} disabled={loading}>{column.name}<span aria-hidden="true">{sortColumn === column.name ? (sortDirection === "asc" ? " ▲" : " ▼") : " ↕"}</span></button></th>{/each}</tr></thead>
          <tbody>
            {#each tableData.rows as row, rowIndex (`${tableData.offset}-${rowIndex}`)}
              <tr>{#each row as value, columnIndex}<td class:selected={selectedCell?.rowIndex === rowIndex && selectedCell.columnIndex === columnIndex} class:null-value={value === "NULL"} title={timestampDisplay(value, tableData.columns[columnIndex]?.name ?? "") ? `${timestampDisplay(value, tableData.columns[columnIndex]?.name ?? "")}\nUnix timestamp: ${value}` : cellPreview(value, tableData.columns[columnIndex]?.name ?? "")} onclick={() => selectCell(rowIndex, columnIndex)}>{cellPreview(value, tableData.columns[columnIndex]?.name ?? "")}</td>{/each}</tr>
            {:else}<tr><td class="empty-cell" colspan={Math.max(tableData.columns.length, 1)}>No rows found.</td></tr>{/each}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button onclick={previousPage} disabled={loading || tableData.offset === 0}>Previous</button>
        <button onclick={nextPage} disabled={loading || tableData.offset + tableData.rows.length >= tableData.total_rows}>Next</button>
      </div>
    {/if}
  </section>
  {#if selectedCell && tableData && selectedColumn}
    <aside class="row-detail" aria-label="Selected database cell">
      <div class="panel-heading"><div><p class="eyebrow">CELL PREVIEW</p><h2>{tableData.table}.{selectedColumn.name}</h2><p class="muted">{selectedColumn.data_type || "untyped"} · row {(tableData.offset + selectedCell.rowIndex + 1).toLocaleString()}</p></div><button onclick={() => selectedCell = null}>Close</button></div>
      <div class="cell-preview">
        {#if timestampDisplay(selectedValue, selectedColumn.name)}
          <div class="timestamp-preview"><strong>{timestampDisplay(selectedValue, selectedColumn.name)}</strong><span>Unix timestamp: <code>{selectedValue}</code></span></div>
        {:else if checkpointMessages}
          <div class="checkpoint-preview-heading">
            <div><strong>Messages</strong><span>{filteredCheckpointMessages.length} of {checkpointMessages.length}</span></div>
            <input bind:value={cellSearch} type="search" aria-label="Search checkpoint messages" placeholder="Search role, type, or content" />
          </div>
          <div class="checkpoint-messages" aria-label="Checkpoint messages">
            {#each filteredCheckpointMessages as message, index (`${String(message.id ?? index)}-${index}`)}
              <details class="checkpoint-message" open={filteredCheckpointMessages.length <= 8}>
                <summary>
                  <span class="message-index">{index + 1}</span>
                  <span class="role-badge">{String(message.role ?? "unknown")}</span>
                  <code>{checkpointContentType(message)}</code>
                  <span class="message-content-preview">{contentPreview(message.content)}</span>
                </summary>
                <div class="checkpoint-message-body">
                  <div class="message-meta"><span>role <code>{String(message.role ?? "unknown")}</code></span><span>content type <code>{checkpointContentType(message)}</code></span></div>
                  <pre>{JSON.stringify(message.content, null, 2)}</pre>
                </div>
              </details>
            {:else}
              <p class="muted empty">No checkpoint messages match “{cellSearch}”.</p>
            {/each}
          </div>
          <details class="checkpoint-raw">
            <summary>Show complete checkpoint JSON</summary>
            <InspectorJsonValue value={selectedJson} label="root" />
          </details>
        {:else if selectedJson !== null}
          <InspectorJsonValue value={selectedJson} label="root" />
        {:else}
          <pre>{selectedValue}</pre>
        {/if}
      </div>
    </aside>
  {/if}
</section>

<style>
  .database-view { display: grid; grid-template-columns: 250px minmax(0, 1fr); width: min(100%, 1680px); flex: 1; min-height: 0; margin: 0 auto; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); box-shadow: 0 4px 18px var(--shadow); }
  .database-view.detail-open { grid-template-columns: 250px minmax(0, 1fr) minmax(300px, 38%); }
  .table-sidebar, .data-panel { display: flex; min-width: 0; min-height: 0; flex-direction: column; }
  .table-sidebar { border-right: 1px solid var(--border); }
  .panel-heading, .data-heading, .result-meta, summary, .pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .panel-heading { flex: none; min-height: 58px; padding: 14px 15px; border-bottom: 1px solid var(--border); }
  h2, p { margin: 0; } h2 { font-size: 14px; } .eyebrow { color: var(--primary); font-size: 10px; font-weight: 800; letter-spacing: .12em; } .muted { color: var(--text-muted); font-size: 12px; }
  button { border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; font-size: 12px; } button:hover:not(:disabled) { border-color: var(--primary); background: var(--item-selected-hover-bg); } button:disabled { cursor: default; opacity: .6; }
  .database-path { overflow: hidden; padding: 9px 12px; border-bottom: 1px solid var(--border); color: var(--text-muted); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .table-list { display: grid; align-content: start; gap: 2px; overflow: auto; padding: 7px; }
  .table-list button { border-color: transparent; text-align: left; background: transparent; }
  .table-list button.active { border-color: color-mix(in srgb, var(--primary) 30%, var(--border)); background: var(--item-selected-bg); }
  .table-list strong, .table-list span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .table-list span { margin-top: 4px; color: var(--text-muted); font-size: 10px; }
  .data-heading { flex: none; padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .data-heading > div { display: grid; gap: 3px; }
  form { display: flex; gap: 6px; }
  input { box-sizing: border-box; width: min(32vw, 360px); border: 1px solid var(--border); border-radius: 6px; padding: 7px 9px; outline: none; background: var(--bg); color: var(--text); font: inherit; font-size: 12px; }
  input:focus { border-color: transparent; box-shadow: var(--focus-ring); }
  .schema { flex: none; border-bottom: 1px solid var(--border); }
  summary { padding: 9px 16px; cursor: pointer; color: var(--text); font-size: 12px; font-weight: 600; list-style: none; }
  summary span { margin-left: auto; color: var(--text-muted); font-weight: 400; }
  summary::-webkit-details-marker { display: none; }
  .schema-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px; max-height: 150px; overflow: auto; padding: 0 16px 12px; }
  .schema-grid article { display: grid; gap: 5px; padding: 8px 9px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); }
  .schema-grid article > div { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .schema-grid code { overflow: hidden; color: var(--primary); font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; }
  .schema-grid article > span { overflow: hidden; color: var(--text-muted); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .badge { padding: 2px 4px; border-radius: 3px; background: var(--surface2); color: var(--text-muted); font-size: 8px; font-weight: 700; white-space: nowrap; }
  .result-meta { flex: none; padding: 8px 16px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 11px; }
  .table-scroll { flex: 1; min-height: 0; overflow: auto; background: var(--bg); }
  table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
  th, td { max-width: 420px; padding: 7px 10px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
  th { position: sticky; top: 0; z-index: 1; padding: 0; background: var(--surface2); color: var(--text-muted); font-weight: 700; }
  th button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: 0; padding: 7px 10px; color: inherit; font: inherit; font-weight: inherit; text-align: left; }
  th button:hover:not(:disabled), th button.active-sort { background: var(--item-selected-hover-bg); color: var(--text); }
  td { cursor: pointer; } td.null-value { color: var(--text-muted); font-style: italic; } tbody tr:hover td, td.selected { background: var(--item-selected-bg); } td.selected { box-shadow: inset 0 0 0 1px var(--primary); }
  .empty-cell { padding: 28px; color: var(--text-muted); text-align: center; }
  .pagination { flex: none; justify-content: flex-end; padding: 9px 12px; border-top: 1px solid var(--border); }
  .error { margin: 10px 16px; padding: 9px; border-radius: 6px; color: #b42318; background: color-mix(in srgb, #b42318 12%, var(--surface)); font-size: 12px; }
  .empty { padding: 20px 12px; }
  .row-detail { display: flex; min-width: 0; min-height: 0; overflow: hidden; flex-direction: column; border-left: 1px solid var(--border); background: var(--bg); }
  .cell-preview { flex: 1; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 12px; }
  .cell-preview pre { max-height: 500px; margin: 0; overflow: auto; padding: 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .checkpoint-preview-heading { position: sticky; top: -12px; z-index: 1; display: grid; gap: 8px; margin: -12px -12px 10px; padding: 12px; border-bottom: 1px solid var(--border); background: var(--bg); }
  .checkpoint-preview-heading > div, .message-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .checkpoint-preview-heading strong { font-size: 12px; }
  .checkpoint-preview-heading span { color: var(--text-muted); font-size: 11px; }
  .checkpoint-preview-heading input { width: 100%; }
  .checkpoint-messages { display: grid; gap: 7px; }
  .checkpoint-message { min-width: 0; max-width: 100%; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); box-sizing: border-box; }
  .checkpoint-message summary { display: grid; min-width: 0; max-width: 100%; overflow: hidden; grid-template-columns: auto auto max-content minmax(0, 1fr); align-items: center; gap: 7px; padding: 8px; cursor: pointer; list-style: none; box-sizing: border-box; }
  .checkpoint-message summary::-webkit-details-marker { display: none; }
  .message-index { color: var(--text-muted); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .role-badge { padding: 2px 5px; border-radius: 3px; background: var(--item-selected-bg); color: var(--primary); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .checkpoint-message summary > code, .message-meta code { color: var(--primary); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .message-content-preview { display: block; min-width: 0; max-width: 100%; overflow: hidden; color: var(--text-muted); font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .checkpoint-message-body { display: grid; gap: 7px; padding: 0 8px 8px; }
  .message-meta { justify-content: flex-start; flex-wrap: wrap; color: var(--text-muted); font-size: 10px; }
  .checkpoint-message-body pre { max-height: 260px; }
  .checkpoint-raw { margin-top: 10px; }
  .checkpoint-raw summary { cursor: pointer; color: var(--text-muted); font-size: 11px; }
  .checkpoint-raw :global(.json-container) { margin-top: 8px; }
  .timestamp-preview { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
  .timestamp-preview strong { font-size: 13px; }
  .timestamp-preview span { color: var(--text-muted); font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
  @media (max-width: 700px) { .database-view { display: block; overflow: auto; } .table-sidebar { max-height: 260px; border-right: 0; border-bottom: 1px solid var(--border); } .data-panel { min-height: 620px; } .data-heading { align-items: stretch; flex-direction: column; } form, input { width: 100%; } }
</style>
