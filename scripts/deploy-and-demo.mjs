import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  encodeBytes32String,
  id,
} from "ethers";

const networkArgIndex = process.argv.indexOf("--network");
const networkName = networkArgIndex >= 0 ? process.argv[networkArgIndex + 1] : "local";
const isSepolia = networkName === "sepolia";

if (!new Set(["local", "sepolia"]).has(networkName)) {
  throw new Error("--network must be either local or sepolia");
}

const rpcUrl = isSepolia
  ? process.env.SEPOLIA_RPC_URL
  : process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";

if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is required for the Sepolia demo");
}

const provider = new JsonRpcProvider(rpcUrl);
const signer = isSepolia
  ? new Wallet(requiredSecret("SEPOLIA_PRIVATE_KEY"), provider)
  : await provider.getSigner(0);

const deployer = await signer.getAddress();
const admin = process.env.ADMIN_ADDRESS ?? deployer;
const operator = process.env.OPERATOR_ADDRESS ?? deployer;
const auditor = process.env.AUDITOR_ADDRESS ?? deployer;
const ticketId = BigInt(process.env.TICKET_ID ?? "13013");
const routeCode = encodeBytes32String(process.env.ROUTE_CODE ?? "A13");
const dataHash = id(process.env.DEMO_RECORD ?? "ticket-13013-demo");

const artifact = await loadArtifact(
  "../artifacts/contracts/TicketSecurityRegistry.sol/TicketSecurityRegistry.json",
);
const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);

console.log(`Network: ${networkName}`);
console.log(`Deployer: ${deployer}`);
console.log("Deploying TicketSecurityRegistry...");

const contract = await factory.deploy(admin, operator, auditor);
await contract.waitForDeployment();
const deploymentTx = contract.deploymentTransaction();
const deploymentReceipt = await deploymentTx.wait();
const contractAddress = await contract.getAddress();

const registerTx = await contract.registerTicket(ticketId, routeCode, dataHash);
const registerReceipt = await registerTx.wait();
const validateTx = await contract.validateTicket(ticketId);
const validateReceipt = await validateTx.wait();
const ticket = await contract.getTicket(ticketId);

console.log(`Contract address: ${contractAddress}`);
console.log(`Deployment tx: ${deploymentReceipt.hash}`);
console.log(`registerTicket tx: ${registerReceipt.hash}`);
console.log(`validateTicket tx: ${validateReceipt.hash}`);
console.log(`Ticket exists: ${ticket[3]}`);
console.log(`Ticket status: ${ticket[1]} (1 = Validated)`);
console.log(`Stored dataHash: ${ticket[2]}`);

if (isSepolia) {
  console.log(`Explorer contract: https://sepolia.etherscan.io/address/${contractAddress}`);
  console.log(`Explorer deployment: https://sepolia.etherscan.io/tx/${deploymentReceipt.hash}`);
  console.log(`Explorer interaction 1: https://sepolia.etherscan.io/tx/${registerReceipt.hash}`);
  console.log(`Explorer interaction 2: https://sepolia.etherscan.io/tx/${validateReceipt.hash}`);
}

function requiredSecret(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required and must only be supplied as an environment variable`);
  }
  return value;
}

async function loadArtifact(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

