const INDEX_URL = "jobs.jsonl";
const GUIDE_KEY = "benchmark-report-guide-dismissed-v1";

const elements = {
  guide: document.querySelector("#guide"),
  dismissGuide: document.querySelector("#dismiss-guide"),
  showGuide: document.querySelector("#show-guide"),
  refresh: document.querySelector("#refresh"),
  search: document.querySelector("#search"),
  statusFilter: document.querySelector("#status-filter"),
  warning: document.querySelector("#data-warning"),
  state: document.querySelector("#state"),
  list: document.querySelector("#report-list"),
  total: document.querySelector("#total-count"),
  completed: document.querySelector("#completed-count"),
  running: document.querySelector("#running-count"),
  averageReward: document.querySelector("#average-reward"),
};

let reports = [];
let invalidLineCount = 0;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be disabled. Dismissal still works for this page view.
  }
}

function setGuideVisible(visible) {
  elements.guide.hidden = !visible;
  if (visible) elements.guide.querySelector("h2")?.focus?.();
}

function parseIndex(text) {
  const latest = new Map();
  invalidLineCount = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (
        typeof record.id !== "string" ||
        typeof record.resultPath !== "string" ||
        (record.sessionPath !== undefined && typeof record.sessionPath !== "string")
      ) {
        throw new Error("Invalid report index record");
      }
      latest.set(record.id, record);
    } catch {
      invalidLineCount += 1;
    }
  }

  return [...latest.values()];
}

async function loadResult(record) {
  try {
    const response = await fetch(record.resultPath, { cache: "no-store" });
    if (response.status === 404) {
      const recordedAt = new Date(record.recordedAt).getTime();
      // ponytail: fresh missing results are pending; add explicit final-state events if verifiers can exceed one hour.
      const recentlyRecorded =
        Number.isFinite(recordedAt) && Date.now() - recordedAt < 3_600_000;
      return {
        ...record,
        result: null,
        resultState: recentlyRecorded ? "pending" : "unavailable",
        resultMessage: recentlyRecorded
          ? "The benchmark is still writing its final result."
          : "The final result file was not found.",
      };
    }
    if (!response.ok) {
      return {
        ...record,
        result: null,
        resultState: "unavailable",
        resultMessage: `The result file could not be loaded (${response.status}).`,
      };
    }
    try {
      return { ...record, result: await response.json(), resultState: "completed" };
    } catch {
      return {
        ...record,
        result: null,
        resultState: "unavailable",
        resultMessage: "The result file is not valid JSON.",
      };
    }
  } catch {
    return {
      ...record,
      result: null,
      resultState: "unavailable",
      resultMessage: "The result file could not be reached.",
    };
  }
}

function getStatus(report) {
  if (report.result?.exception_info) return "error";
  if (report.result) return "completed";
  return report.resultState || "unavailable";
}

function getReward(report) {
  const rewards = report.result?.verifier_result?.rewards;
  if (!rewards || typeof rewards !== "object") return null;
  const reward = rewards.reward ?? Object.values(rewards).find(value => typeof value === "number");
  return typeof reward === "number" ? reward : null;
}

function getTask(report) {
  return report.result?.task_name || report.task || report.trial || "Unknown task";
}

function getModel(report) {
  const info = report.result?.agent_info?.model_info;
  if (info?.provider && info?.name) return `${info.provider}/${info.name}`;
  return report.model || "Unknown model";
}

function formatTitle(value) {
  const lastPart = String(value).split("/").at(-1) || String(value);
  return lastPart.replace(/__[A-Za-z0-9]+$/, "").replaceAll("-", " ");
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateFormatter.format(date);
}

function formatDuration(start, finish) {
  if (!start || !finish) return "—";
  const milliseconds = new Date(finish) - new Date(start);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatTokens(report) {
  const input = report.result?.agent_result?.n_input_tokens;
  const output = report.result?.agent_result?.n_output_tokens;
  if (typeof input !== "number" && typeof output !== "number") return "—";
  return numberFormatter.format((input || 0) + (output || 0));
}

function setState(kind, title, message, action) {
  elements.state.replaceChildren();
  const content = createElement("div", "state-content");
  content.append(createElement("span", "state-icon", kind === "error" ? "!" : "◇"));
  content.append(createElement("h3", "", title));
  content.append(createElement("p", "", message));
  if (action) {
    const button = createElement("button", "button secondary", action.label);
    button.type = "button";
    button.addEventListener("click", action.onClick);
    content.append(button);
  }
  elements.state.append(content);
  elements.state.hidden = false;
}

function createFact(label, value) {
  const fact = createElement("div", "fact");
  fact.append(createElement("span", "", label));
  fact.append(createElement("strong", "", value));
  return fact;
}

function createLink(label, href, available = true) {
  const link = createElement("a", `action-link${available ? "" : " disabled"}`);
  link.append(createElement("span", "", label));
  link.append(createElement("span", "", available ? "↗" : "—"));
  if (available) {
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
  } else {
    link.setAttribute("aria-disabled", "true");
  }
  return link;
}

function createReportCard(report) {
  const status = getStatus(report);
  const reward = getReward(report);
  const result = report.result;
  const article = createElement("article", "report-card");

  const body = createElement("div");
  const titleRow = createElement("div", "report-title-row");
  const badgeLabel = status === "unavailable" ? "Unavailable" : status;
  titleRow.append(createElement("span", `status ${status}`, badgeLabel));
  titleRow.append(createElement("h3", "", formatTitle(getTask(report))));
  body.append(titleRow);

  const context = createElement("p", "report-context mono");
  context.append(createElement("span", "", getModel(report)));
  context.append(createElement("span", "", report.job || "Unknown job"));
  context.append(
    createElement("span", "", formatDate(result?.finished_at || result?.started_at || report.recordedAt)),
  );
  body.append(context);

  const facts = createElement("div", "report-facts");
  facts.append(createFact("Score", reward === null ? "—" : numberFormatter.format(reward)));
  facts.append(createFact("Duration", formatDuration(result?.started_at, result?.finished_at)));
  facts.append(createFact("Tokens", formatTokens(report)));
  body.append(facts);
  article.append(body);

  const actions = createElement("div", "report-actions");
  actions.append(
    createLink(
      "View model transcript",
      report.sessionPath,
      Boolean(report.sessionPath) && report.sessionAvailable !== false,
    ),
  );
  actions.append(createLink("View raw result data", report.resultPath, Boolean(result)));
  if (!result) {
    actions.append(
      createElement("p", "data-note", report.resultMessage || "Result unavailable."),
    );
  }
  article.append(actions);

  return article;
}

function updateSummary() {
  const completed = reports.filter(report => getStatus(report) === "completed").length;
  const pending = reports.filter(report => getStatus(report) === "pending").length;
  const rewards = reports.map(getReward).filter(value => value !== null);
  const average = rewards.length
    ? rewards.reduce((sum, value) => sum + value, 0) / rewards.length
    : null;

  elements.total.textContent = numberFormatter.format(reports.length);
  elements.completed.textContent = numberFormatter.format(completed);
  elements.running.textContent = numberFormatter.format(pending);
  elements.averageReward.textContent = average === null ? "—" : numberFormatter.format(average);
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const statusFilter = elements.statusFilter.value;
  const visible = reports.filter(report => {
    const matchesQuery = !query || [getTask(report), getModel(report), report.job, report.trial]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesStatus = statusFilter === "all" || getStatus(report) === statusFilter;
    return matchesQuery && matchesStatus;
  });

  elements.list.replaceChildren(...visible.map(createReportCard));
  if (visible.length) {
    elements.state.hidden = true;
    return;
  }

  if (reports.length) {
    setState("empty", "No runs match these filters.", "Clear the search or choose another status.", {
      label: "Clear filters",
      onClick: () => {
        elements.search.value = "";
        elements.statusFilter.value = "all";
        render();
      },
    });
  } else {
    if (invalidLineCount) {
      setState(
        "error",
        "The report index could not be read.",
        "No valid runs were found. Ask the site owner to regenerate jobs.jsonl.",
      );
    } else {
      setState(
        "empty",
        "No benchmark reports have been published yet.",
        "New reports appear here after a benchmark finishes.",
      );
    }
  }
}

async function loadReports() {
  elements.refresh.disabled = true;
  elements.warning.hidden = true;
  elements.state.hidden = false;
  elements.state.replaceChildren(createElement("span", "spinner"), "Loading benchmark reports…");

  try {
    const response = await fetch(`${INDEX_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`jobs.jsonl returned ${response.status}`);
    const records = parseIndex(await response.text());
    reports = await Promise.all(records.map(loadResult));
    reports.sort((left, right) => {
      const leftDate = left.result?.finished_at || left.recordedAt || "";
      const rightDate = right.result?.finished_at || right.recordedAt || "";
      return rightDate.localeCompare(leftDate);
    });
    updateSummary();
    elements.warning.hidden = invalidLineCount === 0;
    elements.warning.textContent = invalidLineCount
      ? `${invalidLineCount} unreadable report ${invalidLineCount === 1 ? "entry was" : "entries were"} skipped.`
      : "";
    render();
  } catch {
    reports = [];
    updateSummary();
    const fileHint = location.protocol === "file:"
      ? "Open this site through a local web server. Run `python -m http.server`, then open the address it prints."
      : "Ask the site owner to check that jobs.jsonl exists beside index.html.";
    setState("error", "Could not load report data.", fileHint, {
      label: "Retry",
      onClick: loadReports,
    });
  } finally {
    elements.refresh.disabled = false;
  }
}

if (safeStorageGet(GUIDE_KEY) === "true") setGuideVisible(false);

elements.dismissGuide.addEventListener("click", () => {
  safeStorageSet(GUIDE_KEY, "true");
  setGuideVisible(false);
  elements.showGuide.focus();
});

elements.showGuide.addEventListener("click", () => {
  safeStorageSet(GUIDE_KEY, "false");
  setGuideVisible(true);
  elements.guide.scrollIntoView({ block: "start" });
});

elements.refresh.addEventListener("click", loadReports);
elements.search.addEventListener("input", render);
elements.statusFilter.addEventListener("change", render);

loadReports();
setInterval(loadReports, 30_000);
