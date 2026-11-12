
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(
  "http://127.0.0.1:8545"
);

const artifact = JSON.parse(
  await readFile(
    "./artifacts/contracts/TicketSecurityRegistry.sol/TicketSecurityRegistry.json",
    "utf8"
  )
);

const admin = await provider.getSigner(0);
const operator = await provider.getSigner(1);
const auditor = await provider.getSigner(2);

const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  admin
);

const contract = await factory.deploy(
  await admin.getAddress(),
  await operator.getAddress(),
  await auditor.getAddress()
);

await contract.waitForDeployment();

const secured = contract.connect(operator);
const unauthorized = contract.connect(admin);
const auditClient = contract.connect(auditor);

const route = ethers.encodeBytes32String("AST-ALA");
const dataHash = ethers.keccak256(
  ethers.toUtf8Bytes("synthetic-test-data")
);

const STATUS = {
  Created: 0n,
  Validated: 1n,
  Revoked: 2n
};

console.log(
  "Isolated test contract:",
  await contract.getAddress()
);

function hasError(error, expected) {
  const rawData = error.data ?? error.revert?.data;
  let decoded;

  if (rawData) {
    try {
      decoded = contract.interface.parseError(rawData);
    } catch {
      // Some RPC implementations do not expose revert data.
    }
  }

  return (
    decoded?.name === expected ||
    error.message?.includes(expected)
  );
}

async function expectRevert(operation, errorName) {
  await assert.rejects(
    operation,
    (error) => {
      assert.ok(
        hasError(error, errorName),
        `Expected ${errorName}, got: ${error.message}`
      );
      return true;
    }
  );
}

await test("01 - Operator can register a ticket", async () => {
  const tx = await secured.registerTicket(
    13001n,
    route,
    dataHash
  );

  const receipt = await tx.wait();
  assert.equal(receipt.status, 1);

  const ticket = await contract.getTicket(13001n);
  assert.equal(ticket.exists, true);
  assert.equal(ticket.status, STATUS.Created);
});

await test("02 - Unauthorized account cannot register", async () => {
  await expectRevert(
    unauthorized.registerTicket.staticCall(
      13002n,
      route,
      dataHash
    ),
    "AccessControlUnauthorizedAccount"
  );

  const ticket = await contract.getTicket(13002n);
  assert.equal(ticket.exists, false);
});

await test("03 - Ticket registration event is emitted", async () => {
  const tx = await secured.registerTicket(
    13003n,
    route,
    dataHash
  );

  const receipt = await tx.wait();
  const events = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const event = events.find(
    (item) => item.name === "TicketRegistered"
  );

  assert.ok(event);
  assert.equal(event.args.ticketId, 13003n);
  assert.equal(
    event.args.operator,
    await operator.getAddress()
  );
});

await test("04 - Operator can validate a ticket", async () => {
  const tx = await secured.validateTicket(13001n);
  const receipt = await tx.wait();

  assert.equal(receipt.status, 1);

  const ticket = await contract.getTicket(13001n);
  assert.equal(ticket.status, STATUS.Validated);

  const events = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const changed = events.find(
    (item) => item.name === "TicketStatusChanged"
  );

  assert.ok(changed);
  assert.equal(changed.args.newStatus, STATUS.Validated);
});

await test("05 - Auditor can audit a ticket", async () => {
  const ticket = await auditClient.auditTicket(13001n);

  assert.equal(ticket.status, STATUS.Validated);
  assert.equal(ticket.routeCode, route);
});

await test("06 - Unauthorized audit is rejected", async () => {
  await expectRevert(
    secured.auditTicket.staticCall(13001n),
    "AccessControlUnauthorizedAccount"
  );
});

await test("07 - Duplicate registration is rejected", async () => {
  const before = await contract.getTicket(13001n);

  await expectRevert(
    secured.registerTicket.staticCall(
      13001n,
      route,
      dataHash
    ),
    "TicketAlreadyExists"
  );

  const after = await contract.getTicket(13001n);
  assert.deepEqual([...after], [...before]);
});

await test("08 - Revocation is terminal", async () => {
  const tx = await secured.revokeTicket(13001n);
  await tx.wait();

  assert.equal(
    await contract.isRevoked(13001n),
    true
  );

  await expectRevert(
    secured.validateTicket.staticCall(13001n),
    "InvalidStatusTransition"
  );

  await expectRevert(
    secured.revokeTicket.staticCall(13001n),
    "InvalidStatusTransition"
  );

  const ticket = await contract.getTicket(13001n);
  assert.equal(ticket.status, STATUS.Revoked);
});

await test("09 - Property: valid ticket IDs can register", async () => {
  for (let i = 0; i < 10; i++) {
    const id = BigInt(20000 + i);
    const hash = ethers.keccak256(
      ethers.toUtf8Bytes(`synthetic-${i}`)
    );

    const tx = await secured.registerTicket(id, route, hash);
    await tx.wait();

    const ticket = await contract.getTicket(id);

    assert.equal(ticket.exists, true);
    assert.equal(ticket.dataHash, hash);
    assert.equal(ticket.status, STATUS.Created);
  }
});

await test("10 - Property: unauthorized IDs cannot register", async () => {
  for (let i = 0; i < 10; i++) {
    const id = BigInt(30000 + i);

    await expectRevert(
      unauthorized.registerTicket.staticCall(
        id,
        route,
        dataHash
      ),
      "AccessControlUnauthorizedAccount"
    );

    assert.equal(
      (await contract.getTicket(id)).exists,
      false
    );
  }
});

console.log("Integration and property checks finished.");
