export const TELEMETRY_CATEGORIES = Object.freeze({
  CONTRACT_EVENT: "CONTRACT_EVENT",
  TX_RECEIPT: "TX_RECEIPT",
  APP_RPC_FAILURE: "APP_RPC_FAILURE",
});

export const ALERT_RULES = Object.freeze({
  UNAUTHORIZED_ACCESS: "SEC-001_UNAUTHORIZED_ACCESS",
  OPERATIONAL_RPC_FAILURE: "OPS-001_RPC_FAILURE",
});

const RPC_ERROR_CODES = new Set([
  "NETWORK_ERROR",
  "SERVER_ERROR",
  "TIMEOUT",
  "OFFCHAIN_FAULT",
  "BAD_DATA",
  "UNKNOWN_ERROR",
  "NONCE_EXPIRED",
  "REPLACEMENT_UNDERPRICED",
  "TRANSACTION_REPLACED",
]);

export function createCorrelationId(prefix = "op") {
  const randomPart = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().split("-")[0]
    : Math.random().toString(16).slice(2, 10);

  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function summarizeError(error) {
  return (
    error?.shortMessage ||
    error?.reason ||
    error?.revert?.name ||
    error?.message ||
    "Unknown application or RPC failure"
  );
}

function findErrorData(error) {
  const candidates = [
    error?.data,
    error?.revert?.data,
    error?.error?.data,
    error?.info?.error?.data,
    error?.info?.error?.data?.data,
  ];

  return candidates.find(
    (candidate) => typeof candidate === "string" && candidate.startsWith("0x")
  );
}

function findErrorName(error, contractInterface) {
  const explicitName =
    error?.revert?.name || error?.errorName || error?.info?.errorName;

  if (explicitName) return explicitName;

  const data = findErrorData(error);
  if (!data || !contractInterface) return "";

  try {
    return contractInterface.parseError(data)?.name || "";
  } catch {
    return "";
  }
}

export function classifyFailure(error, context = {}) {
  const operation = context.operation || "unknown";
  const actor = (context.actor || "unknown").toLowerCase();
  const errorName = findErrorName(error, context.contractInterface);
  const message = summarizeError(error);
  const searchable = `${errorName} ${message}`.toLowerCase();

  if (
    errorName === "AccessControlUnauthorizedAccount" ||
    /accesscontrolunauthorizedaccount|unauthorized account|missing role/.test(
      searchable
    )
  ) {
    return {
      shouldAlert: true,
      ruleId: ALERT_RULES.UNAUTHORIZED_ACCESS,
      severity: "HIGH",
      title: "Unauthorized contract access attempt",
      summary: `${operation} was rejected by role-based access control`,
      dedupKey: `${ALERT_RULES.UNAUTHORIZED_ACCESS}:${actor}:${operation}`,
      errorName: errorName || "AccessControlUnauthorizedAccount",
    };
  }

  const rawCode = error?.code ?? error?.error?.code ?? error?.info?.error?.code;
  const code = String(rawCode || "UNKNOWN").toUpperCase();
  const isRpcFailure =
    RPC_ERROR_CODES.has(code) ||
    /failed to fetch|could not coalesce|connection|network|rpc|timeout|socket/.test(
      searchable
    );

  if (isRpcFailure) {
    return {
      shouldAlert: true,
      ruleId: ALERT_RULES.OPERATIONAL_RPC_FAILURE,
      severity: "MEDIUM",
      title: "Operational or RPC failure",
      summary: `${operation} failed (${code})`,
      dedupKey: `${ALERT_RULES.OPERATIONAL_RPC_FAILURE}:${code}:${operation}`,
      errorName: errorName || code,
    };
  }

  return {
    shouldAlert: false,
    ruleId: null,
    severity: "INFO",
    title: "Application failure recorded",
    summary: message,
    dedupKey: null,
    errorName: errorName || code,
  };
}

export function createTelemetryEntry(entry, now = () => new Date()) {
  return {
    id: entry.id || createCorrelationId("tel"),
    timestamp: entry.timestamp || now().toISOString(),
    correlationId: entry.correlationId || createCorrelationId("op"),
    category: entry.category,
    operation: entry.operation || "unknown",
    status: entry.status || "OBSERVED",
    summary: entry.summary || "Telemetry entry",
    transactionHash: entry.transactionHash || "",
    blockNumber: entry.blockNumber ?? null,
    details: entry.details || "",
  };
}

export function upsertDeduplicatedAlert(alerts, alert) {
  const existingIndex = alerts.findIndex(
    (item) => item.dedupKey === alert.dedupKey
  );

  if (existingIndex === -1) {
    return [
      {
        ...alert,
        id: alert.id || createCorrelationId("alert"),
        firstSeen: alert.timestamp,
        lastSeen: alert.timestamp,
        occurrences: 1,
      },
      ...alerts,
    ];
  }

  return alerts.map((item, index) =>
    index === existingIndex
      ? {
          ...item,
          ...alert,
          id: item.id,
          firstSeen: item.firstSeen,
          lastSeen: alert.timestamp,
          occurrences: item.occurrences + 1,
        }
      : item
  );
}
