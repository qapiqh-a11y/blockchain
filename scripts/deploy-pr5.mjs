
import { ethers } from "ethers";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const RPC_URL = "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const artifact = JSON.parse(
  await readFile(
    "./artifacts/contracts/TicketSecurityRegistry.sol/TicketSecurityRegistry.json",
    "utf8"
  )
);

const admin = await provider.getSigner(0);
const operator = await provider.getSigner(1);
const auditor = await provider.getSigner(2);

const adminAddress = await admin.getAddress();
const operatorAddress = await operator.getAddress();
const auditorAddress = await auditor.getAddress();

const network = await provider.getNetwork();

console.log("Chain ID:", network.chainId.toString());
console.log("Admin:", adminAddress);
console.log("Operator:", operatorAddress);
console.log("Auditor:", auditorAddress);

const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  admin
);

const contract = await factory.deploy(
  adminAddress,
  operatorAddress,
  auditorAddress
);

console.log("Waiting for deployment...");
await contract.waitForDeployment();

const address = await contract.getAddress();

const result = {
  chainId: Number(network.chainId),
  contractAddress: address,
  admin: adminAddress,
  operator: operatorAddress,
  auditor: auditorAddress,
  abi: artifact.abi
};

await mkdir("./reports", { recursive: true });

await writeFile(
  "./reports/pr5-deployment.json",
  JSON.stringify(result, null, 2)
);

console.log("DEPLOYED:", address);
console.log("Saved: reports/pr5-deployment.json");
