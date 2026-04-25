# Web UI as Primary — Fastify Port + Docker

Goal: extract the embedded web server from Electron, port it to Fastify, and ship
it as a standalone Docker image with `/data`, `/ebooks`, and `/comics` volumes.
Electron keeps working unchanged by importing the same Fastify app and injecting
host-only capabilities (native file picker, `nativeImage` thumbnail encoder).

## Target layout

```
src/server/
  main.ts             # standalone bootstrap (no electron import)
  config.ts           # RuntimeConfig (dataDir, hostFilePicker?, thumbnailer)
  app.ts              # buildFastifyApp(db, config)
  reply.ts            # JSON / error helpers over FastifyReply
  auth-plugin.ts      # better-auth mounted as Fastify plugin
  thumbnail-sharp.ts  # sharp-based thumbnailer (Docker default)
  routes/
    auth.ts users.ts tags.ts libraries.ts folders.ts
    progress.ts comics.ts upload.ts static.ts
docker/
  Dockerfile
  docker-compose.yml
```

## Config injection (replaces electron globals)

| Old call | New source |
|---|---|
| `app.getPath('userData')` | `config.dataDir` (env `CB8_DATA_DIR`, default `/data`) |
| `nativeImage` (thumbnailGenerator) | `config.thumbnailer` (sharp in server, native in Electron) |
| `dialog.showOpenDialog` (upload) | `config.hostFilePicker?` (omitted in Docker → 501) |
| `BrowserWindow.getFocusedWindow()` | gone — only used by host picker |
| DB path in `main/index.ts` | `path.join(config.dataDir, 'library.db')` |
| Upload dir in `upload.ts` | `path.join(config.dataDir, 'web-uploads')` |
| Image cache in `imageResizer.ts` | `path.join(config.dataDir, 'image-cache')` |

## Volumes

- `/data` — sqlite DB, web-uploads, image-cache
- `/ebooks` — ebook library root (admin adds via UI)
- `/comics` — comic library root (admin adds via UI)

## Task list

### Chunk 1 — foundation + simple routes ✅
- [x] Add deps: `fastify`, `@fastify/static`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/multipart`, `sharp` (already present)
- [x] `src/server/config.ts` — `RuntimeConfig` interface + env loader
- [x] `src/server/reply.ts` — `sendJson`, `sendError`, body parsing helpers
- [x] `src/server/thumbnail-sharp.ts` — sharp-based encoder
- [x] Refactor `thumbnailGenerator.ts` + `imageResizer.ts` to accept injected config (no electron import at module load)
- [x] `src/server/app.ts` — `buildFastifyApp(db, config)` shell with CORS, rate limits, error handler, auth gate hook
- [x] `src/server/auth-bridge.ts` — wraps better-auth's node handler for Fastify
- [x] Port routes: `auth`, `users`, `tags`, `libraries`, `folders`, `progress`, `static`
- [x] Verify `pnpm typecheck` is clean

### Chunk 2 — heavy routes ✅
- [x] Port `comics.ts` — list, get, thumbnail, page streaming, book file, metadata search/apply
- [x] Port `upload.ts` — host-info, pick-path (gated on `config.hostFilePicker`), streaming raw upload, list-dir, NDJSON add-path
- [x] Verify route parity (URL + method + payload + status codes match old server)

### Chunk 3 — cutover + Docker ✅
- [x] `src/server/main.ts` — standalone entry: env → config → DB → Fastify → listen
- [x] Rewire Electron `main/index.ts`: now thin shim over `startServer` with native picker + nativeImage encoder injected
- [x] `vite.server.config.ts` — bundles `src/server/main.ts` to `dist/server/main.cjs` (CJS, natives external)
- [x] `docker/Dockerfile` — multi-stage Node 22; rebuilds `better-sqlite3`/`sharp` against runtime Node via `onlyBuiltDependencies`
- [x] `docker/docker-compose.yml` — service with `/data` `/ebooks` `/comics` volume mounts and `CB8_DATA_DIR=/data`
- [x] Update `package.json` scripts: `server:build`, `server:start`, `docker:build`
- [ ] Delete `src/main/webServer/routes/` (dead code) once parity is verified end-to-end
- [ ] README section: how to run the container

## Out of scope

- Multi-tenant deployments / TLS termination (assume reverse proxy handles it).
- Migrating from `better-sqlite3` to a network DB.
- Changing the web UI itself.
