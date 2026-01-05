````markdown
---
name: redis-elasticache-runtime
description: Redis guidance for this repo: ElastiCache day-0, env vars, Socket.IO adapter, optional HTTP cache, networking and TLS considerations.
---

# Redis (ElastiCache) — Day-0 Runtime Guidance

> [!NOTE]
> **Persona**: You are a platform/SRE engineer. You keep Redis private, secure, and reliably consumable by the app on EKS.

## Scope

This skill applies to this repo’s app (`multi-user-test-fest-issue-tracker`) running on AWS/EKS.

## What Redis is (plain English)

Redis is an **in-memory data store** (think “very fast shared memory over the network”).

In our AWS setup it typically runs as **ElastiCache for Redis** in private subnets.

What Redis is *not* in this app:

- It is **not** our primary database (Postgres/RDS is).
- It is **not** a system of record for issues/rooms/users.
- Data in Redis can be evicted/restarted; the app must remain correct without Redis persistence.

## What we use Redis for in this app

Redis is used to share short-lived state between multiple app replicas.

Redis is used for two things:

- **Socket.IO cross-pod broadcasts** (day-0 recommended; enables `replicas: 2+`)
- **Optional API response caching** (opt-in)

### 1) Socket.IO cross-pod broadcasts (recommended)

Problem:

- With multiple Kubernetes pods, each pod has its own memory. If a user on Pod A creates an issue, users connected to Pod B won’t automatically receive the realtime event.

Solution:

- The Socket.IO Redis adapter uses Redis Pub/Sub so events emitted on one pod are published to Redis and delivered to all other pods.

Outcome:

- Realtime updates work correctly with `replicas: 2+`.

### 2) Optional API response caching (opt-in)

We optionally cache a few read-heavy API responses for a very short TTL to reduce database load.

- Safe because it’s short-lived and correctness is preserved by cache invalidation on writes.
- Disabled by default.

## Required environment variables

### A) Socket.IO adapter (recommended)

- `SOCKETIO_REDIS_ENABLED=true`
- `REDIS_URL=...`

If `SOCKETIO_REDIS_ENABLED=true` and `REDIS_URL` is missing/unreachable, the app fails fast (to avoid running multi-replica without correct broadcasts).

### B) API cache (optional)

- `CACHE_ENABLED=true`
- `CACHE_TTL_SECONDS=10` (default is 10)
- `REDIS_URL=...` (required if you want Redis-backed cache)

Note: caching is intentionally opt-in. If `CACHE_ENABLED` is false, the app uses a noop cache.

## `REDIS_URL` formats

Examples (adjust to org standards):

- No auth:
  - `redis://host:6379`
- With password:
  - `redis://:PASSWORD@host:6379`

If your org requires TLS-in-transit, use `rediss://...` (and any additional parameters required by your standard client configuration).

## AWS/EKS networking expectations

- Redis should be **private** (not internet-accessible)
- Security groups should allow:
  - EKS workloads → Redis on `6379` (or your configured port)
- Nodes/pods still require outbound egress for Entra and optional Jira API calls

## Operational checks

- App starts successfully with `SOCKETIO_REDIS_ENABLED=true`
- Two pods can broadcast events to each other (create issue in one browser, see realtime update in another pinned to different pod)
- Cache (if enabled) does not break correctness (safe, short TTL)

## Repo pointers

- Socket.IO adapter wiring: `server.js`
- Cache implementation: `src/cache.js`
- AWS k8s config placeholders:
  - `aws/k8s/configmap.yaml`
  - `aws/k8s/secret.yaml.template`

## Related links

- Kubernetes skill: `../kubernetes/SKILL.md`
- AWS skill: `../aws/SKILL.md`
- Terraform skill: `../terraform/SKILL.md`

````
