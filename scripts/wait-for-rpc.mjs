const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const attempts = Number(process.env.RPC_WAIT_ATTEMPTS || 30);
const delayMs = Number(process.env.RPC_WAIT_DELAY_MS || 1000);

async function rpcReady() {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });

  if (!response.ok) return false;
  const payload = await response.json();
  return payload.result === "0x7a69";
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    if (await rpcReady()) {
      console.log(`Hardhat RPC ready at ${rpcUrl} (chainId 31337)`);
      process.exit(0);
    }
  } catch {
    // The node may still be starting.
  }

  if (attempt < attempts) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

console.error(`Hardhat RPC did not become ready after ${attempts} attempts`);
process.exit(1);
