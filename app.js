const INDEX_URL = "jobs.jsonl";

const elements = {
  search: document.querySelector("#search"),
  count: document.querySelector("#run-count"),
  warning: document.querySelector("#data-warning"),
  state: document.querySelector("#state"),
  list: document.querySelector("#run-list"),
};

let runs = [];
let runCache = new Map();
let invalidLineCount = 0;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

const statusLabels = {
  completed: "Result ready",
  pending: "Result pending",
  error: "Run failed",
  unavailable: "Result unavailable",
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
      const pending = Number.isFinite(recordedAt) && Date.now() - recordedAt < 3_600_000;
      return {
        ...record,
        result: null,
        resultState: pending ? "pending" : "unavailable",
        resultMessage: pending
          ? "Result pending. The page will load it when updated run data is published."
          : "No result was published for this run.",
      };
    }
    if (!response.ok) {
      return {
        ...record,
        result: null,
        resultState: "unavailable",
        resultMessage: `Result unavailable (HTTP ${response.status}).`,
      };
    }
    try {
      return { ...record, result: await response.json(), resultState: "completed" };
    } catch {
      return {
        ...record,
        result: null,
        resultState: "unavailable",
        resultMessage: "Published result data is invalid.",
      };
    }
  } catch {
    return {
      ...record,
      result: null,
      resultState: "unavailable",
      resultMessage: "Result data could not be loaded. The page will retry when updated run data is published.",
    };
  }
}

function statusOf(run) {
  if (run.result?.exception_info) return "error";
  if (run.result) return "completed";
  return run.resultState || "unavailable";
}

function scoreOf(run) {
  const rewards = run.result?.verifier_result?.rewards;
  if (!rewards || typeof rewards !== "object") return null;
  const score = rewards.reward ?? Object.values(rewards).find(value => typeof value === "number");
  return typeof score === "number" ? score : null;
}

function taskOf(run) {
  return run.result?.task_name || run.task || run.trial || "Unknown task";
}

function modelOf(run) {
  const model = run.result?.agent_info?.model_info;
  if (model?.provider && model?.name) return `${model.provider}/${model.name}`;
  return run.model || "Unknown model";
}

function titleOf(value) {
  const lastPart = String(value).split("/").at(-1) || String(value);
  return lastPart.replace(/__[A-Za-z0-9]+$/, "").replaceAll("-", " ");
}

function dateOf(run) {
  const value = run.result?.finished_at || run.result?.started_at || run.recordedAt;
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : dateFormatter.format(date);
}

function showState(title, message, action) {
  const content = element("div");
  content.append(element("h2", "", title), element("p", "", message));
  if (action) {
    const button = element("button", "", action.label);
    button.type = "button";
    button.addEventListener("click", action.run);
    content.append(button);
  }
  elements.state.replaceChildren(content);
  elements.state.hidden = false;
}

function link(label, href, available, secondary = false) {
  const anchor = element("a", secondary ? "secondary" : "", label);
  if (available) {
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
  } else {
    anchor.setAttribute("aria-disabled", "true");
  }
  return anchor;
}

function runRow(run) {
  const status = statusOf(run);
  const score = scoreOf(run);
  const article = element("article", "run");

  const description = element("div");
  const heading = element("div", "run-heading");
  heading.append(
    element("span", `status ${status}`, statusLabels[status] || "Result unavailable"),
    element("h2", "", titleOf(taskOf(run))),
  );

  const meta = element("p", "meta");
  meta.append(
    element("span", "", `Model: ${modelOf(run)}`),
    element("span", "", `Date: ${dateOf(run)}`),
    element("span", "", `Run ID: ${run.id || "Unavailable"}`),
  );
  description.append(heading, meta);

  const scoreBlock = element("div", score === null ? "score missing" : "score");
  scoreBlock.append(
    element("span", "", "Task score"),
    element("strong", "", score === null ? "Not reported" : numberFormatter.format(score)),
  );

  const transcriptAvailable = Boolean(run.sessionPath) && run.sessionAvailable !== false;
  const resultAvailable = Boolean(run.result);
  const actions = element("div", "actions");
  actions.append(
    link(
      transcriptAvailable ? "View transcript" : "Transcript unavailable",
      run.sessionPath,
      transcriptAvailable,
    ),
    link(
      resultAvailable ? "View result JSON" : "Result JSON unavailable",
      run.resultPath,
      resultAvailable,
      true,
    ),
  );

  article.append(description, scoreBlock, actions);
  if (!run.result) article.append(element("p", "result-note", run.resultMessage || "Result unavailable."));
  return article;
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const visible = runs.filter(run =>
    !query || [taskOf(run), modelOf(run), run.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query),
  );

  const count = runs.length === visible.length
    ? `${runs.length} ${runs.length === 1 ? "run" : "runs"}`
    : `${visible.length} of ${runs.length} runs`;
  elements.count.textContent = count;
  elements.list.replaceChildren(...visible.map(runRow));

  if (visible.length) {
    elements.state.hidden = true;
    return;
  }

  if (runs.length) {
    showState("No matching runs", "Try another task, model, or run ID.", {
      label: "Clear search",
      run: () => {
        elements.search.value = "";
        render();
        elements.search.focus();
      },
    });
  } else if (invalidLineCount) {
    showState(
      "Published run data is invalid",
      "Site owner: rebuild the report index.",
    );
  } else {
    showState("No runs published", "New runs appear here after a benchmark finishes.");
  }
}

async function loadIndexedRun(record) {
  const signature = JSON.stringify(record);
  const cached = runCache.get(record.id);
  if (cached?.signature === signature) return cached;

  return {
    signature,
    run: await loadResult(record),
  };
}

async function loadRuns(showLoading = true) {
  if (showLoading) {
    elements.state.hidden = false;
    elements.state.textContent = "Loading runs…";
  }

  try {
    const response = await fetch(`${INDEX_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Index unavailable");
    const records = parseIndex(await response.text());
    const loadedRuns = await Promise.all(records.map(loadIndexedRun));
    runCache = new Map(
      loadedRuns.map(entry => [entry.run.id, entry]),
    );
    runs = loadedRuns.map(entry => entry.run);
    runs.sort((left, right) => {
      const leftDate = left.result?.finished_at || left.recordedAt || "";
      const rightDate = right.result?.finished_at || right.recordedAt || "";
      return rightDate.localeCompare(leftDate);
    });
    elements.warning.hidden = invalidLineCount === 0;
    elements.warning.textContent = invalidLineCount
      ? `${invalidLineCount} ${invalidLineCount === 1 ? "run could" : "runs could"} not be shown because ${invalidLineCount === 1 ? "its index entry is" : "their index entries are"} invalid.`
      : "";
    render();
  } catch {
    if (runs.length) {
      elements.warning.hidden = false;
      elements.warning.textContent = "Could not refresh. Showing the last loaded runs.";
      return;
    }
    elements.count.textContent = "0 runs";
    const message = location.protocol === "file:"
      ? "This page must be served over HTTP. From the repository root, run python -m http.server and open the address shown."
      : "Site owner: check the published report index.";
    showState("Could not load runs", message, {
      label: "Try again",
      run: () => loadRuns(),
    });
  }
}

elements.search.addEventListener("input", render);

loadRuns();
setInterval(() => loadRuns(false), 300_000);
