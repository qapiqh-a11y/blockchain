import { ethers } from "ethers";
import { readFile } from "node:fs/promises";

const deployment = JSON.parse(
  await readFile("./reports/pr5-deployment.json", "utf8")
);

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

const contract = new ethers.Contract(
  deployment.contractAddress,
  deployment.abi,
  provider
);

const admin = deployment.admin;
const operator = deployment.operator;

const role = await contract.OPERATOR_ROLE();

console.log("Admin:", admin);
console.log("Operator:", operator);
console.log("Admin has OPERATOR_ROLE:", await contract.hasRole(role, admin));
console.log("Operator has OPERATOR_ROLE:", await contract.hasRole(role, operator));

const ticket = await contract.getTicket(13002n);
console.log("Ticket 13002 exists:", ticket[3]);

try {
  await contract.registerTicket.staticCall(
    13002n,
    ethers.encodeBytes32String("AST-ALA"),
    ethers.keccak256(ethers.toUtf8Bytes("negative-test")),
    { from: admin }
  );
  console.log("UNEXPECTED: Unauthorized call accepted");
} catch (error) {
  const parsed = contract.interface.parseError(error.data || error.revert?.data);

  console.log("Error:", parsed?.name || error.shortMessage);
  console.log("Unauthorized account:", parsed?.args?.[0]);
  console.log("Required role:", parsed?.args?.[1]);
}
