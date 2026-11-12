import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALERT_RULES,
  TELEMETRY_CATEGORIES,
  classifyFailure,
  createTelemetryEntry,
  upsertDeduplicatedAlert,
} from "./securityMonitoring.js";

test("unauthorized access maps to security rule SEC-001", () => {
  const result = classifyFailure(
    { revert: { name: "AccessControlUnauthorizedAccount" } },
    { operation: "registerTicket", actor: "0xABC" }
  );

  assert.equal(result.shouldAlert, true);
  assert.equal(result.ruleId, ALERT_RULES.UNAUTHORIZED_ACCESS);
  assert.equal(result.severity, "HIGH");
});

test("network failure maps to operational rule OPS-001", () => {
  const result = classifyFailure(
    { code: "NETWORK_ERROR", message: "RPC connection unavailable" },
    { operation: "queryEvents" }
  );

  assert.equal(result.shouldAlert, true);
  assert.equal(result.ruleId, ALERT_RULES.OPERATIONAL_RPC_FAILURE);
  assert.equal(result.severity, "MEDIUM");
});

test("business validation failure is telemetry but not an alert", () => {
  const result = classifyFailure(
    { revert: { name: "TicketAlreadyExists" } },
    { operation: "registerTicket" }
  );

  assert.equal(result.shouldAlert, false);
});

test("telemetry contains category, ISO timestamp, and correlation ID", () => {
  const entry = createTelemetryEntry(
    {
      category: TELEMETRY_CATEGORIES.TX_RECEIPT,
      correlationId: "tx-demo-001",
      operation: "registerTicket",
    },
    () => new Date("2026-11-12T10:00:00.000Z")
  );

  assert.equal(entry.category, TELEMETRY_CATEGORIES.TX_RECEIPT);
  assert.equal(entry.timestamp, "2026-11-12T10:00:00.000Z");
  assert.equal(entry.correlationId, "tx-demo-001");
});

test("duplicate alerts are merged and occurrence count increases", () => {
  const base = {
    dedupKey: "SEC-001:0xabc:registerTicket",
    timestamp: "2026-11-12T10:00:00.000Z",
    correlationId: "op-1",
    title: "Unauthorized contract access attempt",
  };

  const first = upsertDeduplicatedAlert([], base);
  const second = upsertDeduplicatedAlert(first, {
    ...base,
    timestamp: "2026-11-12T10:01:00.000Z",
    correlationId: "op-2",
  });

  assert.equal(second.length, 1);
  assert.equal(second[0].occurrences, 2);
  assert.equal(second[0].firstSeen, base.timestamp);
  assert.equal(second[0].lastSeen, "2026-11-12T10:01:00.000Z");
});
