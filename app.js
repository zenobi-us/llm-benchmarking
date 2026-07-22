const INDEX_URL = "jobs.jsonl";

const elements = {
  search: document.querySelector("#search"),
  count: document.querySelector("#job-count"),
  warning: document.querySelector("#data-warning"),
  state: document.querySelector("#state"),
  list: document.querySelector("#job-list"),
  chart: document.querySelector("#pass-chart"),
  chartScroll: document.querySelector("#pass-chart-scroll"),
  chartSummary: document.querySelector("#pass-chart-summary"),
  chartTooltip: document.querySelector("#pass-chart-tooltip"),
  chartLegend: document.querySelector("#pass-chart-legend"),
};

let jobs = [];
let jobCache = new Map();
let invalidLineCount = 0;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0,
});

const statusLabels = {
  completed: "Job complete",
  error: "Completed with errors",
  unavailable: "Job data unavailable",
};

const stateClasses = "state min-h-48 border-t border-line py-14 text-muted";
const focusClasses = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-ink";

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
      if (record.schemaVersion === 1) {
        if (
          typeof record.job !== "string" ||
          typeof record.jobResultPath !== "string"
        ) {
          throw new Error("Invalid legacy job index record");
        }
        const resultDirectory = record.jobResultPath.split("/").slice(0, -1).join("/");
        latest.set(record.job, {
          schemaVersion: 1,
          id: record.job,
          recordedAt: record.recordedAt,
          configPath: `${resultDirectory}/config.json`,
          resultPath: record.jobResultPath,
        });
        continue;
      }
      if (
        record.schemaVersion !== 2 ||
        typeof record.id !== "string" ||
        typeof record.configPath !== "string" ||
        typeof record.resultPath !== "string"
      ) {
        throw new Error("Invalid job index record");
      }
      latest.set(record.id, record);
    } catch {
      invalidLineCount += 1;
    }
  }

  return [...latest.values()];
}

async function loadJson(path, label) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      return {
        data: null,
        message: `${label} unavailable (HTTP ${response.status}).`,
      };
    }
    try {
      return { data: await response.json(), message: null };
    } catch {
      return { data: null, message: `${label} contains invalid JSON.` };
    }
  } catch {
    return { data: null, message: `${label} could not be loaded.` };
  }
}

async function resourceAvailable(path) {
  try {
    return (await fetch(path, { method: "HEAD", cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

function collectTrialNames(value, names = new Set()) {
  if (Array.isArray(value)) {
    value.filter(item => typeof item === "string").forEach(item => names.add(item));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectTrialNames(item, names));
  }
  return names;
}

function trialNamesOf(result) {
  const names = new Set();
  for (const evaluation of Object.values(result?.stats?.evals || {})) {
    collectTrialNames(evaluation?.reward_stats, names);
    collectTrialNames(evaluation?.exception_stats, names);
  }
  return [...names];
}

async function loadTrials(record, result) {
  const directory = record.resultPath.split("/").slice(0, -1).join("/");
  return Promise.all(trialNamesOf(result).map(async id => {
    const path = `${directory}/${encodeURIComponent(id)}`;
    const sessionPath = `${path}/agent/session.html`;
    const [config, trialResult, sessionAvailable] = await Promise.all([
      loadJson(`${path}/config.json`, `Task ${id} config`),
      loadJson(`${path}/result.json`, `Task ${id} result`),
      resourceAvailable(sessionPath),
    ]);
    return {
      id,
      configPath: `${path}/config.json`,
      resultPath: `${path}/result.json`,
      sessionPath,
      sessionAvailable,
      config: config.data,
      result: trialResult.data,
      messages: [config.message, trialResult.message].filter(Boolean),
    };
  }));
}

async function loadJob(record) {
  const [config, result] = await Promise.all([
    loadJson(record.configPath, "Job config"),
    loadJson(record.resultPath, "Job result"),
  ]);
  return {
    ...record,
    config: config.data,
    result: result.data,
    trials: result.data ? await loadTrials(record, result.data) : [],
    messages: [config.message, result.message].filter(Boolean),
  };
}

function statusOf(job) {
  if (!job.result) return "unavailable";
  const stats = job.result.stats;
  if ((stats?.n_errored_trials || 0) + (stats?.n_cancelled_trials || 0) > 0) {
    return "error";
  }
  return "completed";
}

function passStatsOf(job) {
  const reported = new Set();
  const passed = new Set();

  for (const evaluation of Object.values(job.result?.stats?.evals || {})) {
    for (const rewards of Object.values(evaluation?.reward_stats || {})) {
      for (const [reward, trialNames] of Object.entries(rewards || {})) {
        if (!Array.isArray(trialNames)) continue;
        trialNames.forEach(name => reported.add(name));
        if (Number(reward) > 0) trialNames.forEach(name => passed.add(name));
      }
    }
  }

  const total = typeof job.result?.n_total_trials === "number"
    ? job.result.n_total_trials
    : reported.size;
  return total ? { passed: passed.size, total, ratio: passed.size / total } : null;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const chartColors = [
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-pending)",
  "var(--color-danger)",
  "var(--color-unavailable)",
];

function svgElement(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function chartDataOf(items) {
  const days = new Map();
  const models = new Set();
  let sampleCount = 0;

  for (const job of items) {
    const stats = passStatsOf(job);
    const model = modelsOf(job)[0];
    const rawDate = job.result?.finished_at || job.result?.started_at || job.recordedAt;
    const date = rawDate ? new Date(rawDate) : null;
    if (!stats || !model || !date || Number.isNaN(date.getTime())) continue;

    const key = date.toISOString().slice(0, 10);
    const day = days.get(key) || { key, date, models: new Map() };
    const aggregate = day.models.get(model) || { passed: 0, total: 0 };
    aggregate.passed += stats.passed;
    aggregate.total += stats.total;
    day.models.set(model, aggregate);
    days.set(key, day);
    models.add(model);
    sampleCount += 1;
  }

  return {
    days: [...days.values()].sort((left, right) => left.key.localeCompare(right.key)),
    models: [...models].sort(),
    sampleCount,
  };
}

function hideChartTooltip() {
  elements.chartTooltip.hidden = true;
}

function showChartTooltip(target, day, model, stats, color) {
  const rate = stats.passed / stats.total;
  const title = element("p", "font-display text-xl font-bold uppercase tracking-tight text-paper", day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  const modelRow = element("p", "mt-3 flex items-center gap-2 font-mono text-sm text-muted");
  const swatch = element("span", "h-2.5 w-2.5 shrink-0");
  swatch.style.background = color;
  modelRow.append(swatch, document.createTextNode(model));
  const result = element("p", "mt-3 border-t border-line pt-3 text-sm text-muted");
  result.append(
    element("strong", "mr-2 font-display text-3xl font-bold text-paper", percentFormatter.format(rate)),
    document.createTextNode(`${stats.passed}/${stats.total} tasks passed`),
  );
  elements.chartTooltip.replaceChildren(title, modelRow, result);

  const chartRect = elements.chart.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const x = Math.min(chartRect.width - 120, Math.max(120, targetRect.left - chartRect.left + targetRect.width / 2));
  const y = Math.max(0, targetRect.top - chartRect.top - 12);
  elements.chartTooltip.style.left = `${x}px`;
  elements.chartTooltip.style.top = `${y}px`;
  elements.chartTooltip.style.transform = "translate(-50%, -100%)";
  elements.chartTooltip.hidden = false;
}

function renderPassChart() {
  const data = chartDataOf(jobs);
  elements.chartScroll.replaceChildren();
  elements.chartLegend.replaceChildren();
  hideChartTooltip();

  if (!data.days.length) {
    elements.chartSummary.textContent = "Pass-rate evidence appears after completed jobs report task outcomes.";
    elements.chartScroll.append(element("p", "border-y border-line py-10 text-muted", "No daily model pass rates available."));
    return;
  }

  elements.chartSummary.textContent = `${data.sampleCount} completed ${data.sampleCount === 1 ? "job" : "jobs"} · ${data.days.length} ${data.days.length === 1 ? "day" : "days"} · ${data.models.length} ${data.models.length === 1 ? "model" : "models"}`;

  const left = 66;
  const right = 28;
  const top = 92;
  const bottom = 324;
  const plotHeight = bottom - top;
  const minimumDayWidth = Math.max(118, data.models.length * 28 + 34);
  const width = Math.max(1080, left + right + data.days.length * minimumDayWidth);
  const dayWidth = Math.max(minimumDayWidth, (width - left - right) / data.days.length);
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} 360`,
    role: "img",
    "aria-label": "Daily grouped model pass-rate chart",
  });
  svg.style.width = `${width}px`;
  svg.style.height = "360px";

  for (const tick of [0, 25, 50, 75, 100]) {
    const y = bottom - (tick / 100) * plotHeight;
    svg.append(
      svgElement("line", {
        x1: left,
        y1: y,
        x2: width - right,
        y2: y,
        stroke: "var(--color-line)",
        "stroke-dasharray": "2 7",
      }),
      svgElement("text", {
        x: left - 12,
        y: y + 4,
        fill: "var(--color-muted)",
        "font-family": "IBM Plex Mono, monospace",
        "font-size": "11",
        "text-anchor": "end",
      }, `${tick}%`),
    );
  }

  data.days.forEach((day, dayIndex) => {
    const dayStart = left + dayIndex * dayWidth;
    const groupWidth = data.models.length * 20 + Math.max(0, data.models.length - 1) * 5;
    const groupStart = dayStart + (dayWidth - groupWidth) / 2;
    const center = dayStart + dayWidth / 2;
    const dateLabel = day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
    svg.append(svgElement("text", {
      x: center,
      y: 72,
      fill: "var(--color-muted)",
      "font-family": "IBM Plex Mono, monospace",
      "font-size": "12",
      "font-weight": "500",
      "letter-spacing": "1.5",
      "text-anchor": "middle",
      transform: `rotate(-90 ${center} 72)`,
    }, dateLabel));

    data.models.forEach((model, modelIndex) => {
      const x = groupStart + modelIndex * 25;
      const stats = day.models.get(model);
      svg.append(svgElement("line", {
        x1: x + 10,
        y1: top,
        x2: x + 10,
        y2: bottom,
        stroke: "var(--color-line)",
        "stroke-dasharray": "2 7",
      }));
      if (!stats) return;

      const rate = stats.passed / stats.total;
      const color = chartColors[modelIndex % chartColors.length];
      const y = bottom - rate * plotHeight;
      const background = svgElement("rect", {
        x,
        y: top,
        width: 20,
        height: plotHeight,
        fill: "var(--color-surface-strong)",
      });
      const bar = svgElement("rect", {
        x,
        y,
        width: 20,
        height: Math.max(2, bottom - y),
        fill: color,
        tabindex: "0",
        role: "img",
        "aria-label": `${model}: ${percentFormatter.format(rate)} pass rate on ${dateLabel}`,
      });
      bar.style.cursor = "pointer";
      bar.addEventListener("mouseenter", () => showChartTooltip(bar, day, model, stats, color));
      bar.addEventListener("focus", () => showChartTooltip(bar, day, model, stats, color));
      bar.addEventListener("mouseleave", hideChartTooltip);
      bar.addEventListener("blur", hideChartTooltip);
      svg.append(background, bar);
    });
  });

  elements.chartScroll.append(svg);
  data.models.forEach((model, index) => {
    const item = element("span", "inline-flex items-center gap-2 font-mono text-xs text-muted");
    const swatch = element("span", "h-2.5 w-2.5 shrink-0");
    swatch.style.background = chartColors[index % chartColors.length];
    item.append(swatch, document.createTextNode(model));
    elements.chartLegend.append(item);
  });
}

function tasksOf(job) {
  const tasks = job.config?.tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map(task => task?.name || task?.path)
    .filter(value => typeof value === "string");
}

function modelsOf(job) {
  const agents = job.config?.agents;
  if (!Array.isArray(agents)) return [];
  return agents
    .map(agent => agent?.model_name)
    .filter(value => typeof value === "string");
}

function summarize(values, fallback) {
  if (!values.length) return fallback;
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

function dateOf(job) {
  const value = job.result?.finished_at || job.result?.started_at || job.recordedAt;
  if (!value) return { label: "Unavailable", iso: null };
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? { label: "Unavailable", iso: null }
    : { label: dateFormatter.format(date), iso: date.toISOString() };
}

function formattedDate(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : dateFormatter.format(date);
}

function showLoadingState() {
  const loading = element("div", "mx-auto w-full max-w-xl");
  const lines = element("div", "grid gap-2.5");
  lines.setAttribute("aria-hidden", "true");
  lines.append(
    element("span", "h-2 w-full animate-evidence-pulse bg-surface-strong opacity-40"),
    element("span", "h-2 w-4/5 animate-evidence-pulse bg-surface-strong opacity-40 [animation-delay:100ms]"),
    element("span", "h-2 w-3/5 animate-evidence-pulse bg-surface-strong opacity-40 [animation-delay:200ms]"),
  );
  loading.append(element("p", "mb-5", "Reading job index…"), lines);
  elements.state.className = `${stateClasses} text-left`;
  elements.state.setAttribute("aria-busy", "true");
  elements.state.replaceChildren(loading);
  elements.state.hidden = false;
}

function showState(title, message, action) {
  const content = element("div");
  content.append(
    element("h2", "mb-2 font-display text-2xl font-bold uppercase tracking-tight text-paper", title),
    element("p", "mx-auto max-w-xl", message),
  );
  if (action) {
    const button = element("button", `mt-5 cursor-pointer border border-line bg-surface px-4 py-2.5 font-semibold text-paper transition-colors hover:border-accent hover:text-accent ${focusClasses}`, action.label);
    button.type = "button";
    button.addEventListener("click", action.run);
    content.append(button);
  }
  elements.state.className = `${stateClasses} text-center`;
  elements.state.setAttribute("aria-busy", "false");
  elements.state.replaceChildren(content);
  elements.state.hidden = false;
}

function link(label, href, available, secondary = false) {
  const tone = secondary ? "text-muted text-sm" : "text-paper";
  const anchor = element("a", `group inline-flex items-center gap-1 underline decoration-line underline-offset-4 transition-colors hover:text-accent ${tone} ${focusClasses}`);
  anchor.append(document.createTextNode(label));
  if (available) {
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    const arrow = element("span", "inline-block no-underline transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5", "↗");
    arrow.setAttribute("aria-hidden", "true");
    anchor.append(arrow);
  } else {
    anchor.setAttribute("aria-disabled", "true");
    anchor.className = "pointer-events-none inline-flex text-sm text-muted no-underline";
  }
  return anchor;
}

function metadataItem(term, value) {
  const item = element("div");
  item.append(
    element("dt", "text-xs font-bold uppercase tracking-wider text-muted", term),
    element("dd", "mt-1 wrap-anywhere font-mono text-sm text-paper", value ?? "Unavailable"),
  );
  return item;
}

function rewardOf(trial) {
  const rewards = trial.result?.verifier_result?.rewards;
  if (!rewards || typeof rewards !== "object") return null;
  const reward = rewards.reward ?? Object.values(rewards).find(value => typeof value === "number");
  return typeof reward === "number" ? reward : null;
}

function taskRow(trial) {
  const task = element("article", "border border-line bg-surface/70 p-5 sm:p-7");
  const header = element("div", "mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center");
  const title = trial.result?.task_name
    || trial.config?.task?.name
    || trial.config?.task?.path
    || trial.id;
  const reward = rewardOf(trial);
  const outcome = trial.result?.exception_info
    ? "Error"
    : reward === null ? "Not reported" : reward > 0 ? "Passed" : "Failed";
  const outcomeTone = {
    Passed: "border-success/40 text-success",
    Failed: "border-danger/40 text-danger",
    Error: "border-danger/40 text-danger",
    "Not reported": "border-line text-muted",
  }[outcome];
  header.append(
    element("h3", "wrap-anywhere font-display text-xl font-bold uppercase tracking-tight text-paper", title),
    element("span", `inline-flex min-h-6 items-center border px-2 py-1 font-mono text-xs lowercase ${outcomeTone}`, outcome),
  );

  const model = trial.result?.agent_info?.model_info;
  const metadata = element("dl", "mb-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2");
  metadata.append(
    metadataItem("Trial", trial.result?.trial_name || trial.id),
    metadataItem("Model", model?.provider && model?.name ? `${model.provider}/${model.name}` : trial.config?.agent?.model_name),
    metadataItem("Environment", trial.config?.environment?.type),
    metadataItem("Started", formattedDate(trial.result?.started_at)),
    metadataItem("Finished", formattedDate(trial.result?.finished_at)),
    metadataItem("Input tokens", typeof trial.result?.agent_result?.n_input_tokens === "number" ? numberFormatter.format(trial.result.agent_result.n_input_tokens) : null),
    metadataItem("Output tokens", typeof trial.result?.agent_result?.n_output_tokens === "number" ? numberFormatter.format(trial.result.agent_result.n_output_tokens) : null),
    metadataItem("Reward", reward === null ? null : numberFormatter.format(reward)),
  );

  const actions = element("div", "flex flex-col items-start gap-2 sm:flex-row sm:gap-5");
  actions.append(
    link(trial.sessionAvailable ? "View session" : "Session unavailable", trial.sessionPath, trial.sessionAvailable),
    link(trial.config ? "View task config" : "Task config unavailable", trial.configPath, Boolean(trial.config), true),
    link(trial.result ? "View task result" : "Task result unavailable", trial.resultPath, Boolean(trial.result), true),
  );

  task.append(header, metadata, actions);
  if (trial.messages.length) task.append(element("p", "mt-4 text-sm text-muted", trial.messages.join(" ")));
  return task;
}

function jobRow(job) {
  const status = statusOf(job);
  const passStats = passStatsOf(job);
  const article = element("details", "group border-b border-line");
  article.setAttribute("name", "benchmark-jobs");
  const summary = element("summary", `grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_1rem] gap-4 py-8 transition-colors hover:bg-surface/60 sm:grid-cols-[minmax(0,1fr)_8rem_1rem] sm:gap-6 md:px-4 md:-mx-4 [&::-webkit-details-marker]:hidden ${focusClasses}`);

  const description = element("div");
  const heading = element("div", "mb-3 flex min-w-0 flex-wrap items-center gap-2.5");
  const statusTone = {
    completed: "text-success",
    error: "text-danger",
    unavailable: "text-unavailable",
  }[status];
  heading.append(
    element("span", `shrink-0 text-xs font-bold uppercase tracking-wider before:mr-2 before:content-['●'] ${statusTone}`, statusLabels[status]),
    element("h2", "min-w-0 wrap-anywhere font-display text-2xl font-bold uppercase leading-none tracking-tight text-paper", job.id),
    element("span", "inline-flex min-h-6 items-center border border-accent/40 px-2 py-1 font-mono text-xs lowercase text-accent", job.config?.environment?.type || "Environment unavailable"),
  );

  const runDate = dateOf(job);
  const time = element("time", "", `Finished: ${runDate.label}`);
  if (runDate.iso) {
    time.dateTime = runDate.iso;
    time.title = `Exact time: ${runDate.iso}`;
  }

  const stats = job.result?.stats;
  const totalTrials = job.result?.n_total_trials;
  const completedTrials = stats?.n_completed_trials;
  const trialSummary = typeof totalTrials === "number"
    ? `Trials: ${typeof completedTrials === "number" ? completedTrials : 0}/${totalTrials}`
    : "Trials: unavailable";

  const meta = element("p", "flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-sm text-muted");
  meta.append(
    element("span", "", `Model: ${summarize(modelsOf(job), "Unavailable")}`),
    element("span", "", trialSummary),
    time,
  );
  description.append(heading, meta);

  const scoreBlock = element("div", "col-start-1 row-start-2 border-l-2 border-accent pl-4 sm:col-start-2 sm:row-start-1");
  scoreBlock.append(
    element("span", "block text-xs font-semibold uppercase tracking-wider text-muted", "Tasks passed"),
    element("strong", passStats === null ? "mt-1 block text-sm font-semibold text-paper" : "mt-1 block font-display text-4xl font-bold leading-none tabular-nums text-paper", passStats === null ? "Not reported" : percentFormatter.format(passStats.ratio)),
  );

  const toggle = element("span", "col-start-2 row-span-2 row-start-1 h-2.5 w-2.5 self-center border-b-2 border-r-2 border-accent transition-transform duration-200 ease-out rotate-45 group-open:rotate-[225deg] sm:col-start-3 sm:row-span-1");
  toggle.setAttribute("aria-hidden", "true");
  summary.append(description, scoreBlock, toggle);

  const body = element("div", "pb-10 pt-5");
  const bodyHeading = element("div", "mb-5 flex items-baseline justify-between gap-4");
  bodyHeading.append(
    element("h3", "font-display text-lg font-bold uppercase tracking-tight text-paper", "Tasks"),
    element("span", "text-sm text-muted", passStats ? `${passStats.passed}/${passStats.total} passed` : "Pass rate unavailable"),
  );

  const taskList = element("div", "mb-7 grid gap-4");
  if (job.trials.length) {
    taskList.append(...job.trials.map(taskRow));
  } else {
    taskList.append(element("p", "text-muted", "Task metadata unavailable."));
  }

  const actions = element("div", "flex flex-col items-start gap-2 sm:flex-row sm:gap-5");
  actions.append(
    link(
      job.config ? "View job config" : "Job config unavailable",
      job.configPath,
      Boolean(job.config),
    ),
    link(
      job.result ? "View job result" : "Job result unavailable",
      job.resultPath,
      Boolean(job.result),
      true,
    ),
  );

  body.append(bodyHeading, taskList, actions);
  article.append(summary, body);
  if (job.messages.length) {
    article.append(element("p", "mb-4 text-sm text-muted", job.messages.join(" ")));
  }
  return article;
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const visible = jobs.filter(job =>
    !query || [job.id, job.jobId, ...tasksOf(job), ...modelsOf(job)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query),
  );

  elements.count.textContent = jobs.length === visible.length
    ? `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`
    : `${visible.length} of ${jobs.length} jobs`;
  elements.list.replaceChildren(...visible.map(jobRow));

  if (visible.length) {
    elements.state.hidden = true;
    elements.state.setAttribute("aria-busy", "false");
    return;
  }

  if (jobs.length) {
    showState("No matching jobs", "Try another task, model, or job ID.", {
      label: "Clear search",
      run: () => {
        elements.search.value = "";
        render();
        elements.search.focus();
      },
    });
  } else if (invalidLineCount) {
    showState("Published job data is invalid", "Site owner: rebuild the job index.");
  } else {
    showState("No jobs published", "Completed benchmark jobs appear here.");
  }
}

async function loadIndexedJob(record) {
  const signature = JSON.stringify(record);
  const cached = jobCache.get(record.id);
  if (cached?.signature === signature) return cached;
  return { signature, job: await loadJob(record) };
}

async function loadJobs(showLoading = true) {
  if (showLoading) showLoadingState();
  elements.list.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(`${INDEX_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Index unavailable");
    const records = parseIndex(await response.text());
    const loadedJobs = await Promise.all(records.map(loadIndexedJob));
    jobCache = new Map(loadedJobs.map(entry => [entry.job.id, entry]));
    jobs = loadedJobs.map(entry => entry.job);
    jobs.sort((left, right) => {
      const leftDate = left.result?.finished_at || left.recordedAt || "";
      const rightDate = right.result?.finished_at || right.recordedAt || "";
      return rightDate.localeCompare(leftDate);
    });
    elements.warning.hidden = invalidLineCount === 0;
    elements.warning.textContent = invalidLineCount
      ? `${invalidLineCount} ${invalidLineCount === 1 ? "job could" : "jobs could"} not be shown because ${invalidLineCount === 1 ? "its index entry is" : "their index entries are"} invalid.`
      : "";
    renderPassChart();
    render();
  } catch {
    if (jobs.length) {
      elements.warning.hidden = false;
      elements.warning.textContent = "Could not refresh. Showing the last loaded jobs.";
      return;
    }
    elements.count.textContent = "0 jobs";
    const message = location.protocol === "file:"
      ? "This page must be served over HTTP. From the repository root, run python -m http.server and open the address shown."
      : "Site owner: check the published job index.";
    showState("Could not load jobs", message, {
      label: "Try again",
      run: () => loadJobs(),
    });
  } finally {
    elements.list.setAttribute("aria-busy", "false");
  }
}

elements.search.addEventListener("input", render);
document.addEventListener("keydown", event => {
  const target = event.target;
  const isEditing = target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );

  if (event.key === "/" && !isEditing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    elements.search.focus();
  }

  if (event.key === "Escape" && document.activeElement === elements.search && elements.search.value) {
    elements.search.value = "";
    render();
  }
});

loadJobs();
setInterval(() => loadJobs(false), 300_000);
