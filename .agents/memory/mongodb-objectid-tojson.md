---
name: MongoDB ObjectId toJSON Fix
description: All Schema.Types.ObjectId ref fields (userId, datasetId, etc.) remain as Mongoose ObjectId objects unless explicitly stringified — causing === comparisons with req.user!.id to always fail.
---

## The Rule
Any field declared `{ type: Schema.Types.ObjectId, ref: "..." }` in a Mongoose schema comes back as an ObjectId object from `.findById()` / `.find()`, NOT a plain string — even after `.toJSON()` — unless the transform explicitly converts it.

## Why
Mongoose's `toJSON` transform only maps `_id → id` automatically. All other ObjectId ref fields (e.g. `userId`, `datasetId`, `sharedByUserId`) stay as ObjectId objects. So:
```js
dataset.userId !== req.user!.id   // ObjectId("abc") !== "abc" → always true → 403
```

## Fix Applied
In `server/db.ts`, the global `toJSON` transform now iterates all keys and stringifies any remaining ObjectId values:
```js
for (const key of Object.keys(ret)) {
  const val = ret[key];
  if (val && typeof val === "object" && val.constructor?.name === "ObjectId") {
    ret[key] = val.toString();
  }
}
```

## How to Apply
- After any new Mongoose schema that has `Schema.Types.ObjectId` ref fields, confirm the global toJSON transform in `db.ts` covers them (it now does automatically).
- Never use `parseInt()` or `Number()` on MongoDB ObjectId strings — they are 24-char hex, not integers.
- When comparing IDs from Mongoose docs, always use `String(a) === String(b)` as an extra safety net.
