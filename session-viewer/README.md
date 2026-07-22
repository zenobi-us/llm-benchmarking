# Pi session viewer

Bun, React, and Tailwind viewer for `../jobs/**/agent/session.html` exports.

```bash
cd session-viewer
bun install
bun run dev
```

Open <http://localhost:3000>. Bun provides frontend HMR; native `fs.watch` pushes session export changes to the browser over server-sent events.

Run `bun run test` for the server and filesystem-watch smoke check.
