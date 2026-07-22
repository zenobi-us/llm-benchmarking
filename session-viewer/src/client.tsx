import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

interface SessionExport {
  path: string;
  job: string;
  trial: string;
  title: string;
  modifiedAt: string;
  size: number;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function App() {
  const [sessions, setSessions] = useState<SessionExport[]>([]);
  const [selectedPath, setSelectedPath] = useState(
    () => new URLSearchParams(location.search).get("session") ?? "",
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions", { cache: "no-store" });
      if (!response.ok) throw new Error(`Session scan failed: ${response.status}`);
      const nextSessions = (await response.json()) as SessionExport[];
      setSessions(nextSessions);
      setSelectedPath(current => {
        if (nextSessions.some(session => session.path === current)) return current;
        return nextSessions[0]?.path ?? "";
      });
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Session scan failed");
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    const events = new EventSource("/api/events");
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.addEventListener("sessions", () => void loadSessions());
    return () => events.close();
  }, [loadSessions]);

  useEffect(() => {
    const url = new URL(location.href);
    if (selectedPath) url.searchParams.set("session", selectedPath);
    else url.searchParams.delete("session");
    history.replaceState(null, "", url);
  }, [selectedPath]);

  const visibleSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter(session =>
      `${session.title} ${session.trial} ${session.job}`.toLowerCase().includes(needle),
    );
  }, [query, sessions]);

  const selected = sessions.find(session => session.path === selectedPath);
  const sessionUrl = selected
    ? `/session?path=${encodeURIComponent(selected.path)}`
    : undefined;

  return (
    <main className="flex h-dvh min-h-0 flex-col bg-zinc-950 text-zinc-100 lg:flex-row">
      <aside className="flex max-h-[45dvh] min-h-0 w-full shrink-0 flex-col border-b border-zinc-800 bg-zinc-950 lg:max-h-none lg:w-96 lg:border-r lg:border-b-0">
        <header className="border-b border-zinc-800 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.22em] text-amber-400 uppercase">
                Harbor archive
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">Pi sessions</h1>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-zinc-800 px-2.5 py-1 font-mono text-[10px] text-zinc-400 uppercase">
              <span
                className={`size-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-600"}`}
              />
              {connected ? "watching" : "offline"}
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <label className="sr-only" htmlFor="session-search">
              Search sessions
            </label>
            <input
              id="session-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Filter task or run…"
              className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
            />
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="rounded-md border border-zinc-800 px-3 text-sm text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              aria-label="Refresh session list"
            >
              ↻
            </button>
          </div>

          <p className="mt-3 font-mono text-[11px] text-zinc-500">
            {visibleSessions.length} of {sessions.length} exports
          </p>
        </header>

        <nav aria-label="Session exports" className="min-h-0 flex-1 overflow-y-auto p-2">
          {error ? (
            <p className="m-2 rounded-md border border-red-950 bg-red-950/30 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          {visibleSessions.map(session => {
            const active = session.path === selectedPath;
            return (
              <button
                key={session.path}
                type="button"
                onClick={() => setSelectedPath(session.path)}
                className={`mb-1 w-full rounded-md border px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
                  active
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-transparent hover:border-zinc-800 hover:bg-zinc-900"
                }`}
              >
                <span className="block truncate text-sm font-medium capitalize text-zinc-100">
                  {session.title}
                </span>
                <span className="mt-1 block truncate font-mono text-[10px] text-zinc-500">
                  {session.job}
                </span>
                <span className="mt-2 flex justify-between gap-3 font-mono text-[10px] text-zinc-500">
                  <time dateTime={session.modifiedAt}>
                    {dateFormatter.format(new Date(session.modifiedAt))}
                  </time>
                  <span>{formatBytes(session.size)}</span>
                </span>
              </button>
            );
          })}

          {!error && visibleSessions.length === 0 ? (
            <div className="grid min-h-40 place-items-center px-6 text-center text-sm text-zinc-500">
              {sessions.length === 0
                ? "No jobs/**/agent/session.html exports found."
                : "No sessions match this filter."}
            </div>
          ) : null}
        </nav>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-900">
        {selected && sessionUrl ? (
          <>
            <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/90 px-5">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-medium capitalize">{selected.title}</h2>
                <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                  {selected.trial}
                </p>
              </div>
              <a
                href={sessionUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                Open raw ↗
              </a>
            </header>
            <iframe
              key={`${selected.path}:${selected.modifiedAt}`}
              src={sessionUrl}
              title={`Pi session: ${selected.title}`}
              sandbox="allow-scripts allow-popups"
              className="min-h-0 w-full flex-1 border-0 bg-white"
            />
          </>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-zinc-600 uppercase">
                No session selected
              </p>
              <p className="mt-2 text-sm text-zinc-500">Choose an export from the archive.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
