// Stub server-only so bun test can import server modules without throwing.
// Next.js enforces this at bundler level; in tests we skip the guard.
import { mock } from "bun:test";
mock.module("server-only", () => ({}));

// Limit DB pool per worker so parallel test workers don't exhaust Postgres max_connections (100).
// 24 test files × 3 conns/worker = 72 ≤ 100.
process.env.DB_POOL_MAX ??= "3";
