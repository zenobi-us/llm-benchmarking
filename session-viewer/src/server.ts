import { Glob } from "bun";
import { existsSync, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import homepage from "./index.html";

const APP_DIR = resolve(import.meta.dir, "..");
const ROOT_DIR = resolve(APP_DIR, "..");
const JOBS_DIR = join(ROOT_DIR, "jobs");
const sessionGlob = new Glob("**/agent/session.html");
const encoder = new TextEncoder();
const eventClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

async function listSessions() {
  const paths = Array.from(sessionGlob.scanSync({ cwd: JOBS_DIR, onlyFiles: true }));
  const sessions = await Promise.all(
    paths.map(async path => {
      const metadata = await stat(join(JOBS_DIR, path));
      const parts = path.split("/");
      const job = parts.at(-4) ?? "unknown job";
      const trial = parts.at(-3) ?? "unknown trial";

      return {
        path,
        job,
        trial,
        title: trial.replace(/__[A-Za-z0-9]+$/, "").replaceAll("-", " "),
        modifiedAt: metadata.mtime.toISOString(),
        size: metadata.size,
      };
    }),
  );

  return sessions.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

function sessionFile(path: string | null) {
  if (!path || !sessionGlob.match(path)) return null;

  const absolutePath = resolve(JOBS_DIR, path);
  if (!absolutePath.startsWith(`${JOBS_DIR}${sep}`)) return null;

  return Bun.file(absolutePath);
}

function sessionEvents(request: Request) {
  let client: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = controller;
      eventClients.add(controller);
      controller.enqueue(encoder.encode("event: ready\ndata: connected\n\n"));
      request.signal.addEventListener("abort", () => eventClients.delete(controller), {
        once: true,
      });
    },
    cancel() {
      if (client) eventClients.delete(client);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}

function broadcastSessionChange() {
  const message = encoder.encode(`event: sessions\ndata: ${Date.now()}\n\n`);
  for (const client of eventClients) {
    try {
      client.enqueue(message);
    } catch {
      eventClients.delete(client);
    }
  }
}

if (existsSync(JOBS_DIR)) {
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(JOBS_DIR, { recursive: true }, () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(broadcastSessionChange, 150);
  });
  process.on("exit", () => watcher.close());
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development:
    process.env.NODE_ENV === "production" ? false : { hmr: true, console: true },
  routes: {
    "/": homepage,
    "/api/sessions": {
      async GET() {
        return Response.json(await listSessions(), {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
    "/api/events": {
      GET: sessionEvents,
    },
    "/session": {
      async GET(request) {
        const path = new URL(request.url).searchParams.get("path");
        const file = sessionFile(path);
        if (!file || !(await file.exists())) {
          return new Response("Session export not found", { status: 404 });
        }
        return new Response(file, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Pi session viewer: ${server.url}`);
