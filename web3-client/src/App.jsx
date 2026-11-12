import { useEffect, useState } from "react";
import { ethers } from "ethers";
import deployment from "./deployment.json";
import {
  ALERT_RULES,
  TELEMETRY_CATEGORIES,
  classifyFailure,
  createCorrelationId,
  createTelemetryEntry,
  summarizeError,
  upsertDeduplicatedAlert,
} from "./securityMonitoring";
import "./App.css";

const statusNames = ["Created", "Validated", "Revoked"];
const MAX_TELEMETRY_ENTRIES = 100;

function shortHash(value = "") {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "-";
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString("ru-RU") : "-";
}

function eventSummary(parsed) {
  if (parsed?.name === "TicketRegistered") {
    return `Ticket #${parsed.args.ticketId} registered`;
  }

  if (parsed?.name === "TicketStatusChanged") {
    return `Ticket #${parsed.args.ticketId}: ${statusNames[Number(parsed.args.previousStatus)]} → ${statusNames[Number(parsed.args.newStatus)]}`;
  }

  return parsed?.name || "Contract event";
}

export default function App() {
  const [account, setAccount] = useState("");
  const [accountRole, setAccountRole] = useState("Not connected");
  const [chainId, setChainId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [routeCode, setRouteCode] = useState("AST-ALA");
  const [ticket, setTicket] = useState(null);
  const [count, setCount] = useState("-");
  const [events, setEvents] = useState([]);
  const [stage, setStage] = useState("Idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [telemetry, setTelemetry] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [lastDetection, setLastDetection] = useState(null);

  function appendTelemetry(entries) {
    const normalized = entries.map((entry) => createTelemetryEntry(entry));

    setTelemetry((current) => {
      const incomingIds = new Set(normalized.map((item) => item.id));
      return [
        ...normalized,
        ...current.filter((item) => !incomingIds.has(item.id)),
      ].slice(0, MAX_TELEMETRY_ENTRIES);
    });
  }

  function recordFailure(error, context) {
    const timestamp = new Date().toISOString();
    const detection = classifyFailure(error, context);
    const errorMessage = summarizeError(error);

    appendTelemetry([
      {
        timestamp,
        correlationId: context.correlationId,
        category: TELEMETRY_CATEGORIES.APP_RPC_FAILURE,
        operation: context.operation,
        status: "FAILED",
        summary: errorMessage,
        details: detection.errorName,
      },
    ]);

    if (detection.shouldAlert) {
      setAlerts((current) =>
        upsertDeduplicatedAlert(current, {
          ...detection,
          timestamp,
          correlationId: context.correlationId,
          actor: context.actor || account || "unknown",
        })
      );
    }

    setLastDetection({
      outcome: detection.shouldAlert ? "ALERT" : "NO_ALERT",
      correlationId: context.correlationId,
      operation: context.operation,
      ruleId: detection.ruleId,
      summary: detection.shouldAlert
        ? detection.title
        : "Failure recorded; no detection rule matched",
      timestamp,
    });

    return detection;
  }

  function markNormal(correlationId, operation, summary) {
    setLastDetection({
      outcome: "NO_ALERT",
      correlationId,
      operation,
      ruleId: null,
      summary,
      timestamp: new Date().toISOString(),
    });
  }

  async function getContract(write = false) {
    if (!window.ethereum) throw Error("MetaMask not found");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();

    if (Number(network.chainId) !== deployment.chainId) {
      const error = Error(`Wrong network. Switch to chainId ${deployment.chainId}`);
      error.code = "NETWORK_ERROR";
      throw error;
    }

    const runner = write ? await provider.getSigner() : provider;
    return new ethers.Contract(
      deployment.contractAddress,
      deployment.abi,
      runner
    );
  }

  async function resolveAccountRole(address) {
    try {
      const contract = await getContract();
      const [operatorRole, auditorRole] = await Promise.all([
        contract.OPERATOR_ROLE(),
        contract.AUDITOR_ROLE(),
      ]);
      const [isAdmin, isOperator, isAuditor] = await Promise.all([
        contract.hasRole(ethers.ZeroHash, address),
        contract.hasRole(operatorRole, address),
        contract.hasRole(auditorRole, address),
      ]);

      const roles = [];
      if (isAdmin) roles.push("ADMIN");
      if (isOperator) roles.push("OPERATOR");
      if (isAuditor) roles.push("AUDITOR");
      setAccountRole(roles.join(" + ") || "UNAUTHORIZED");
    } catch {
      setAccountRole("Role unavailable");
    }
  }

  useEffect(() => {
    if (!window.ethereum) return undefined;

    const handleAccountsChanged = async (addresses) => {
      const nextAccount = addresses[0] || "";
      setAccount(nextAccount);
      setAccountRole(nextAccount ? "Checking…" : "Not connected");
      if (nextAccount) await resolveAccountRole(nextAccount);
    };

    const handleChainChanged = (nextChainId) => {
      setChainId(BigInt(nextChainId).toString());
      setAccountRole("Reconnect to check role");
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  async function connect() {
    const correlationId = createCorrelationId("connect");

    try {
      if (!window.ethereum) throw Error("Install MetaMask");

      const addresses = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const selectedAccount = addresses[0];

      setAccount(selectedAccount);
      setChainId(network.chainId.toString());
      setMessage("Wallet connected");

      if (Number(network.chainId) !== deployment.chainId) {
        const error = Error(`Wrong network: expected ${deployment.chainId}`);
        error.code = "NETWORK_ERROR";
        throw error;
      }

      await resolveAccountRole(selectedAccount);
      markNormal(correlationId, "connectWallet", "Wallet and RPC connection healthy");
    } catch (error) {
      setMessage(summarizeError(error));
      recordFailure(error, {
        correlationId,
        operation: "connectWallet",
        actor: account,
      });
    }
  }

  function disconnect() {
    setAccount("");
    setAccountRole("Not connected");
    setChainId("");
    setTicket(null);
    setEvents([]);
    setMessage("Application session disconnected");
  }

  async function loadTicketSnapshot(id, contract = null) {
    const reader = contract || (await getContract());
    const [result, total] = await Promise.all([
      reader.getTicket(BigInt(id)),
      reader.ticketCount(),
    ]);

    setCount(total.toString());
    setTicket({
      routeCode: result[3] ? ethers.decodeBytes32String(result[0]) : "-",
      status: statusNames[Number(result[1])],
      dataHash: result[2],
      exists: result[3],
    });
  }

  async function readTicket() {
    const correlationId = createCorrelationId("read");
    let contract;

    try {
      contract = await getContract();
      await loadTicketSnapshot(ticketId, contract);
      setMessage("Read successful");
      markNormal(correlationId, "getTicket", "Read completed with no alert");
    } catch (error) {
      setMessage(summarizeError(error));
      recordFailure(error, {
        correlationId,
        operation: "getTicket",
        actor: account,
        contractInterface: contract?.interface,
      });
    }
  }

  async function readEvents() {
    const correlationId = createCorrelationId("events");
    let contract;

    try {
      contract = await getContract();
      const [registration, changes] = await Promise.all([
        contract.queryFilter(contract.filters.TicketRegistered(), 0),
        contract.queryFilter(contract.filters.TicketStatusChanged(), 0),
      ]);

      const unique = new Map();
      for (const log of [...registration, ...changes]) {
        unique.set(`${log.transactionHash}:${log.index}`, log);
      }

      const logs = [...unique.values()].sort(
        (a, b) => b.blockNumber - a.blockNumber
      );
      const blockNumbers = [...new Set(logs.map((log) => log.blockNumber))];
      const blocks = await Promise.all(
        blockNumbers.map((number) => contract.runner.getBlock(number))
      );
      const blockTimes = new Map(
        blocks.map((block) => [block.number, block.timestamp])
      );

      setEvents(
        logs.map((log) => ({
          key: `${log.transactionHash}:${log.index}`,
          event: log.fragment?.name || "Unknown",
          block: log.blockNumber,
          hash: log.transactionHash,
        }))
      );

      appendTelemetry(
        logs.map((log) => ({
          id: `event:${log.transactionHash}:${log.index}`,
          timestamp: new Date(blockTimes.get(log.blockNumber) * 1000).toISOString(),
          correlationId,
          category: TELEMETRY_CATEGORIES.CONTRACT_EVENT,
          operation: log.fragment?.name || "contractEvent",
          status: "CONFIRMED",
          summary: eventSummary(log),
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
        }))
      );

      setMessage(`${logs.length} contract event(s) loaded`);
      markNormal(correlationId, "queryEvents", "Event query completed with no alert");
    } catch (error) {
      setMessage(summarizeError(error));
      recordFailure(error, {
        correlationId,
        operation: "queryEvents",
        actor: account,
        contractInterface: contract?.interface,
      });
    }
  }

  async function recordConfirmedTransaction(contract, receipt, correlationId, operation) {
    const block = await contract.runner.provider.getBlock(receipt.blockNumber);
    const timestamp = new Date(block.timestamp * 1000).toISOString();

    appendTelemetry([
      {
        id: `receipt:${receipt.hash}`,
        timestamp,
        correlationId,
        category: TELEMETRY_CATEGORIES.TX_RECEIPT,
        operation,
        status: receipt.status === 1 ? "SUCCESS" : "REVERTED",
        summary: `Receipt confirmed; gas used ${receipt.gasUsed.toString()}`,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        details: `status=${receipt.status}; gasUsed=${receipt.gasUsed}`,
      },
      ...receipt.logs.flatMap((log) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return [
            {
              id: `event:${receipt.hash}:${log.index}`,
              timestamp,
              correlationId,
              category: TELEMETRY_CATEGORIES.CONTRACT_EVENT,
              operation: parsed.name,
              status: "CONFIRMED",
              summary: eventSummary(parsed),
              transactionHash: receipt.hash,
              blockNumber: receipt.blockNumber,
            },
          ];
        } catch {
          return [];
        }
      }),
    ]);
  }

  async function sendTransaction(action, ticketOverride = null) {
    const correlationId = createCorrelationId(action);
    const selectedTicketId = ticketOverride || ticketId;
    const operation = `${action}Ticket`;
    let contract;

    try {
      if (!selectedTicketId) throw Error("Ticket ID is required");

      setStage("Waiting for signature");
      setMessage("");
      setTxHash("");

      contract = await getContract(true);
      let tx;

      if (action === "register") {
        const route = ethers.encodeBytes32String(routeCode);
        const hash = ethers.keccak256(
          ethers.toUtf8Bytes(`ticket:${selectedTicketId}:${routeCode}`)
        );
        tx = await contract.registerTicket(BigInt(selectedTicketId), route, hash);
      } else if (action === "validate") {
        tx = await contract.validateTicket(BigInt(selectedTicketId));
      } else {
        tx = await contract.revokeTicket(BigInt(selectedTicketId));
      }

      setTxHash(tx.hash);
      setStage("Waiting for confirmation");
      const receipt = await tx.wait();

      if (receipt.status !== 1) throw Error("Transaction reverted");

      await recordConfirmedTransaction(
        contract,
        receipt,
        correlationId,
        operation
      );
      setStage("Success");
      setMessage(`Confirmed in block ${receipt.blockNumber}`);
      setTicketId(String(selectedTicketId));
      await loadTicketSnapshot(selectedTicketId);
      markNormal(
        correlationId,
        operation,
        "Transaction receipt and contract event verified; no alert"
      );
    } catch (error) {
      setStage("Error");
      const rejected = error.code === "ACTION_REJECTED" || error.code === 4001;
      setMessage(rejected ? "User rejected the signature" : summarizeError(error));
      recordFailure(error, {
        correlationId,
        operation,
        actor: account,
        contractInterface: contract?.interface,
      });
    }
  }

  async function testUnauthorizedRule() {
    const correlationId = createCorrelationId("access-test");
    const demoTicketId = BigInt(900000 + (Date.now() % 90000));
    let contract;

    try {
      setStage("Testing access rule");
      contract = await getContract(true);
      const route = ethers.encodeBytes32String(routeCode);
      const hash = ethers.keccak256(
        ethers.toUtf8Bytes(`access-test:${demoTicketId}`)
      );

      await contract.registerTicket.staticCall(demoTicketId, route, hash);
      setStage("No violation");
      setMessage("Current account is authorized. Switch to ADMIN or another non-operator account to trigger SEC-001.");
      markNormal(
        correlationId,
        "registerTicket.accessTest",
        "Access check passed; no unauthorized attempt detected"
      );
    } catch (error) {
      const detection = recordFailure(error, {
        correlationId,
        operation: "registerTicket.accessTest",
        actor: account,
        contractInterface: contract?.interface,
      });
      setStage(detection.shouldAlert ? "Alert triggered" : "Test failed");
      setMessage(
        detection.shouldAlert
          ? `${detection.ruleId}: unauthorized call blocked`
          : summarizeError(error)
      );
    }
  }

  function runNormalDemo() {
    const demoTicketId = 700000 + (Date.now() % 90000);
    sendTransaction("register", demoTicketId);
  }

  function clearMonitoring() {
    setTelemetry([]);
    setAlerts([]);
    setLastDetection(null);
    setStage("Idle");
    setTxHash("");
    setMessage("Monitoring view cleared");
  }

  const categoryCounts = {
    [TELEMETRY_CATEGORIES.CONTRACT_EVENT]: telemetry.filter(
      (item) => item.category === TELEMETRY_CATEGORIES.CONTRACT_EVENT
    ).length,
    [TELEMETRY_CATEGORIES.TX_RECEIPT]: telemetry.filter(
      (item) => item.category === TELEMETRY_CATEGORIES.TX_RECEIPT
    ).length,
    [TELEMETRY_CATEGORIES.APP_RPC_FAILURE]: telemetry.filter(
      (item) => item.category === TELEMETRY_CATEGORIES.APP_RPC_FAILURE
    ).length,
  };

  return (
    <main className="dashboard">
      <header>
        <div>
          <p className="eyebrow">VARIANT 13 · TRANSPORT SECURITY</p>
          <h1>Web3 Security Telemetry Dashboard</h1>
          <p>Contract events · Transaction receipts · App/RPC failures</p>
        </div>
        <div>
          {account ? (
            <button className="secondary" onClick={disconnect}>Disconnect session</button>
          ) : (
            <button onClick={connect}>Connect MetaMask</button>
          )}
        </div>
      </header>

      <section className="cards">
        <article>
          <h3>Wallet / Role</h3>
          <p className="address">{account || "Not connected"}</p>
          <span className="role-badge">{accountRole}</span>
        </article>
        <article>
          <h3>Network</h3>
          <p>Chain ID: {chainId || "-"}</p>
          <small>Expected: {deployment.chainId}</small>
        </article>
        <article>
          <h3>Contract</h3>
          <p className="address">{deployment.contractAddress}</p>
        </article>
        <article>
          <h3>Active Alerts</h3>
          <p className={`metric ${alerts.length ? "danger-text" : "ok-text"}`}>
            {alerts.length}
          </p>
          <small>Deduplicated alert records</small>
        </article>
      </section>

      <section className="monitor-grid">
        <article className="telemetry-stat contract-stat">
          <span>Contract events</span>
          <strong>{categoryCounts.CONTRACT_EVENT}</strong>
        </article>
        <article className="telemetry-stat receipt-stat">
          <span>Transaction receipts</span>
          <strong>{categoryCounts.TX_RECEIPT}</strong>
        </article>
        <article className="telemetry-stat failure-stat">
          <span>App / RPC failures</span>
          <strong>{categoryCounts.APP_RPC_FAILURE}</strong>
        </article>
      </section>

      {lastDetection && (
        <section className={`detection-result ${lastDetection.outcome === "ALERT" ? "alert-result" : "normal-result"}`}>
          <div>
            <strong>
              {lastDetection.outcome === "ALERT"
                ? "ALERT TRIGGERED"
                : "NORMAL · NO ALERT"}
            </strong>
            <p>{lastDetection.summary}</p>
          </div>
          <div className="detection-meta">
            <span>{lastDetection.ruleId || "No rule matched"}</span>
            <code>{lastDetection.correlationId}</code>
            <small>{formatTime(lastDetection.timestamp)}</small>
          </div>
        </section>
      )}

      <div className="columns">
        <section className="panel">
          <h2>Ticket Operations</h2>
          <label>Ticket ID</label>
          <input
            type="number"
            min="1"
            value={ticketId}
            onChange={(event) => setTicketId(event.target.value)}
            placeholder="Example: 13001"
          />

          <label>Route Code</label>
          <input
            value={routeCode}
            maxLength={31}
            onChange={(event) => setRouteCode(event.target.value)}
          />

          <div className="actions">
            <button className="secondary" onClick={readTicket}>Read Ticket</button>
            <button onClick={() => sendTransaction("register")}>Register Ticket</button>
            <button onClick={() => sendTransaction("validate")}>Validate</button>
            <button onClick={() => sendTransaction("revoke")}>Revoke</button>
          </div>
        </section>

        <section className="panel">
          <h2>Live Demonstration</h2>
          <p className="hint">
            ADMIN is not an OPERATOR. Use the access test with ADMIN to trigger
            SEC-001; use the normal transaction with OPERATOR for a successful
            receipt and no alert.
          </p>
          <div className="demo-actions">
            <button className="danger-button" onClick={testUnauthorizedRule}>
              Test unauthorized access rule
            </button>
            <button className="success-button" onClick={runNormalDemo}>
              Run normal operator transaction
            </button>
            <button className="secondary" onClick={clearMonitoring}>
              Clear monitoring view
            </button>
          </div>
          <div className="transaction-summary">
            <p><strong>Stage:</strong> {stage}</p>
            <p><strong>Result:</strong> {message || "No activity"}</p>
            {txHash && <p className="address">Tx: {txHash}</p>}
          </div>
          {ticket && (
            <div className="result">
              <p>Exists: {String(ticket.exists)}</p>
              <p>Route: {ticket.routeCode}</p>
              <p>Status: {ticket.status}</p>
              <p className="address">Data hash: {ticket.dataHash}</p>
            </div>
          )}
        </section>
      </div>

      <section className="panel rules-panel">
        <div className="section-head">
          <div>
            <h2>Detection Rules</h2>
            <p>Every evaluation is tied to a timestamp and correlation ID.</p>
          </div>
        </div>
        <div className="rule-list">
          <div>
            <code>{ALERT_RULES.UNAUTHORIZED_ACCESS}</code>
            <strong>Unauthorized access attempt</strong>
            <span>High · AccessControl rejection / missing role</span>
          </div>
          <div>
            <code>{ALERT_RULES.OPERATIONAL_RPC_FAILURE}</code>
            <strong>Operational / RPC failure</strong>
            <span>Medium · network, timeout, server, or malformed RPC data</span>
          </div>
        </div>
      </section>

      <section className="panel alerts-panel">
        <div className="section-head">
          <div>
            <h2>Deduplicated Alerts</h2>
            <p>Repeated matches update occurrence count instead of creating alert spam.</p>
          </div>
          <span className="alert-count">{alerts.length} active</span>
        </div>

        {alerts.length === 0 ? (
          <div className="empty-state ok-state">No active security alerts</div>
        ) : (
          <div className="alert-list">
            {alerts.map((alert) => (
              <article key={alert.id} className="alert-card">
                <div className="alert-heading">
                  <span className="severity">{alert.severity}</span>
                  <strong>{alert.title}</strong>
                  <span>{alert.occurrences} occurrence(s)</span>
                </div>
                <p>{alert.summary}</p>
                <div className="alert-meta">
                  <code>{alert.ruleId}</code>
                  <code>{alert.correlationId}</code>
                  <span>Actor: {shortHash(alert.actor)}</span>
                  <span>Last seen: {formatTime(alert.lastSeen)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Security Telemetry</h2>
            <p>Unified timeline for all three telemetry categories.</p>
          </div>
          <button className="secondary" onClick={readEvents}>Refresh On-chain Events</button>
        </div>

        <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Category</th>
                <th>Operation / Status</th>
                <th>Correlation ID</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {telemetry.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-cell">No telemetry collected yet</td>
                </tr>
              )}
              {telemetry.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatTime(entry.timestamp)}</td>
                  <td><span className={`category ${entry.category.toLowerCase()}`}>{entry.category}</span></td>
                  <td>
                    <strong>{entry.operation}</strong>
                    <small>{entry.status} · {entry.summary}</small>
                  </td>
                  <td><code>{entry.correlationId}</code></td>
                  <td>
                    {entry.transactionHash ? (
                      <>
                        <span>Block #{entry.blockNumber}</span>
                        <code>{shortHash(entry.transactionHash)}</code>
                      </>
                    ) : (
                      <span>{entry.details || "Application log"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel legacy-events">
        <div className="section-head">
          <h2>On-chain Event Index</h2>
          <span>{events.length} loaded · {count} registered tickets</span>
        </div>
        <div className="events">
          {events.length === 0 && <p>No indexed events loaded</p>}
          {events.slice(0, 8).map((event) => (
            <div key={event.key} className="event">
              <strong>{event.event}</strong>
              <span>Block #{event.block}</span>
              <small className="address">{event.hash}</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
