---
name: MongoDB Migration
description: Full migration from PostgreSQL/Drizzle ORM to MongoDB/Mongoose — covers all changed files, ID type changes, and VPS deployment notes.
---

# MongoDB Migration

**Why:** User requested complete shift from PostgreSQL to MongoDB for all data storage.

## What changed
- `shared/schema.ts` — replaced all Drizzle `pgTable` definitions with plain TypeScript interfaces + Zod schemas. All `id` fields changed from `number` to `string`.
- `server/db.ts` — replaced `drizzle-orm/node-postgres` + `pg.Pool` with `mongoose` connection + 8 Mongoose models. Connection reads `MONGODB_URI` from env. Models use `toJSON` transform to expose `id` (string) instead of `_id`.
- `server/storage.ts` — replaced `DatabaseStorage` (Drizzle queries) with `MongoStorage` (Mongoose). Session store changed from `connect-pg-simple` to `connect-mongo`.
- `server/auth.ts` — `deserializeUser` id type changed from `number` to `string`.
- `server/routes.ts` — all `parseInt(req.params.id)` replaced with `req.params.id`; added `seedDefaults()` that creates admin user + 3 default config profiles on first boot if none exist.
- `drizzle.config.ts` — neutralised (no longer throws on missing DATABASE_URL).
- `ecosystem.config.cjs` — DATABASE_URL removed; `MONGODB_URI` placeholder added.

## How to apply
- Any new storage method must use `string` IDs, not `number`.
- `toJSON` transform on all Mongoose models ensures `id` is returned instead of `_id`/`__v`.
- `seedDefaults()` is idempotent — safe to re-run on every startup.

## VPS deployment (ecosystem.config.cjs)
The `MONGODB_URI` field in `ecosystem.config.cjs` is a placeholder (`PASTE_YOUR_MONGODB_URI_HERE`). The user must replace it with their actual MongoDB connection string before deploying to VPS. Same for `SESSION_SECRET`.
