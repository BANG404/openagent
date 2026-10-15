const byId = (id) => document.getElementById(id);
const results = byId("results");
const search = byId("search");
let mode = "logs",
  offset = 0,
  nextOffset = null,
  generation = 0;
let detailGeneration = 0,
  continuation = null;

async function api(path, params = {}) {
  const response = await fetch("/observe/api/" + path + "?" + new URLSearchParams(params));
  if (!response.ok) throw new Error("查询失败（HTTP " + response.status + "），请稍后重试。");
  return response.json();
}

function text(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value ?? "";
  return element;
}

function action(label, handler) {
  const button = text("button", label);
  button.addEventListener("click", handler);
  return button;
}

async function load() {
  const current = ++generation;
  results.setAttribute("aria-busy", "true");
  const loading = text("p", "正在读取…");
  loading.className = "loading";
  results.replaceChildren(loading);
  byId("notice").textContent = "";
  byId("next").disabled = true;
  const params = Object.fromEntries(new FormData(search));
  for (const key of ["start", "end"])
    if (params[key]) params[key] = new Date(params[key]).toISOString();
  if (mode === "reports") delete params.severity;
  try {
    const data = await api(mode, { ...params, offset, limit: 25 });
    if (current !== generation) return;
    nextOffset = data.nextOffset;
    const table = document.createElement("table"),
      head = document.createElement("thead"),
      body = document.createElement("tbody");
    const labels =
      mode === "logs"
        ? ["时间", "严重程度 / 版本", "诊断事件"]
        : ["收到时间", "版本 / 平台", "问题描述 / 编号"];
    const row = document.createElement("tr");
    labels.forEach((label) => row.append(text("th", label)));
    head.append(row);
    for (const item of data.items) {
      const tr = document.createElement("tr");
      tr.append(
        text(
          "td",
          (item.time || item.receivedAt || "").replace("T", " ").replace("+00:00", " UTC"),
        ),
      );
      tr.append(
        text(
          "td",
          mode === "logs"
            ? `${item.severity} / ${item.version || "—"}`
            : `${item.runtimeVersion} / ${item.os}`,
        ),
      );
      const cell = document.createElement("td");
      if (mode === "logs") {
        cell.append(text("div", item.body));
        const disclosure = document.createElement("details");
        disclosure.append(
          text("summary", "查看字段"),
          text("pre", JSON.stringify(item.record, null, 2)),
        );
        cell.append(disclosure);
      } else {
        cell.append(text("div", item.description));
        cell.append(action(item.reportId, () => report(item.reportId)));
      }
      tr.append(cell);
      body.append(tr);
    }
    table.append(head, body);
    if (data.items.length) results.replaceChildren(table);
    else {
      const empty = text("p", "没有匹配的记录，可调整时间或关键词。");
      empty.className = "empty";
      results.replaceChildren(empty);
    }
    byId("page-label").textContent = `第 ${Math.floor(offset / 25) + 1} 页`;
    byId("next").disabled = nextOffset === null;
    byId("previous").disabled = offset === 0;
    const status = await api("status");
    if (current !== generation) return;
    byId("status").textContent =
      `${status.logs} 条诊断 · ${status.reports} 份报告 · ${status.lastIndexedAt ? "索引 " + new Date(status.lastIndexedAt).toLocaleTimeString() : "正在建立索引"}`;
    if (status.archiveErrors || status.indexError)
      byId("notice").textContent = "部分归档暂时无法读取，请管理员检查索引状态。";
  } catch (error) {
    if (current !== generation) return;
    byId("notice").textContent = error.message;
    results.replaceChildren(text("p", "查询未完成，请重试。"));
  } finally {
    if (current === generation) results.setAttribute("aria-busy", "false");
  }
}

async function readContent(path, params, current, append = false) {
  if (current !== detailGeneration) return;
  byId("more-content").hidden = true;
  if (!append) byId("content").textContent = "正在读取…";
  try {
    const data = await api(path, params);
    if (current !== detailGeneration) return;
    const value = data.content ?? JSON.stringify(data.items, null, 2);
    byId("content").textContent = append ? byId("content").textContent + "\n" + value : value;
    continuation =
      data.nextOffset === null
        ? null
        : () => readContent(path, { ...params, offset: data.nextOffset }, current, true);
    byId("more-content").hidden = !continuation;
  } catch (error) {
    if (current === detailGeneration) byId("content").textContent = error.message;
  }
}

async function report(id) {
  const current = ++detailGeneration;
  byId("detail").hidden = false;
  byId("summary").textContent = "正在读取报告…";
  byId("content").textContent = "";
  byId("attachments").replaceChildren();
  byId("more-content").hidden = true;
  try {
    const data = await api("reports/" + id);
    if (current !== detailGeneration) return;
    byId("summary").textContent = JSON.stringify(data, null, 2);
    const controls = byId("attachments");
    for (const log of data.logs)
      controls.append(
        action(log.fileName, () =>
          readContent(
            `reports/${id}/logs`,
            { name: log.fileName, limit: 16000 },
            ++detailGeneration,
          ),
        ),
      );
    for (const section of data.traceSections)
      controls.append(
        action("追踪 · " + section, () =>
          readContent(`reports/${id}/trace`, { section, limit: 5 }, ++detailGeneration),
        ),
      );
    const download = text("a", "下载完整归档");
    download.href = `/observe/api/reports/${id}/archive`;
    controls.append(download);
    byId("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (current === detailGeneration) byId("summary").textContent = error.message;
  }
}

for (const name of ["logs", "reports"])
  byId(name + "-tab").addEventListener("click", () => {
    mode = name;
    offset = 0;
    byId("logs-tab").setAttribute("aria-pressed", String(mode === "logs"));
    byId("reports-tab").setAttribute("aria-pressed", String(mode === "reports"));
    byId("severity-field").hidden = mode === "reports";
    byId("detail").hidden = true;
    detailGeneration++;
    load();
  });
search.addEventListener("submit", (event) => {
  event.preventDefault();
  offset = 0;
  load();
});
byId("next").addEventListener("click", () => {
  if (nextOffset !== null) {
    offset = nextOffset;
    load();
  }
});
byId("previous").addEventListener("click", () => {
  offset = Math.max(0, offset - 25);
  load();
});
byId("close-detail").addEventListener("click", () => {
  byId("detail").hidden = true;
  detailGeneration++;
});
byId("more-content").addEventListener("click", () => continuation?.());
load();
