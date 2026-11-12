// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TicketSecurityRegistry} from "../contracts/TicketSecurityRegistry.sol";

contract UnauthorizedCaller {
    function register(
        TicketSecurityRegistry registry,
        uint256 ticketId,
        bytes32 routeCode,
        bytes32 dataHash
    ) external {
        registry.registerTicket(ticketId, routeCode, dataHash);
    }

    function audit(TicketSecurityRegistry registry, uint256 ticketId) external view {
        registry.auditTicket(ticketId);
    }
}

/// @notice 8 focused unit tests + 2 fuzz tests required by Practical Work #3.
contract TicketSecurityRegistryTest {
    TicketSecurityRegistry registry;
    UnauthorizedCaller unauthorized;

    bytes32 constant ROUTE_A13 = bytes32("A13");
    bytes32 constant DATA_HASH = keccak256("protected-offchain-ticket-record");

    function setUp() public {
        // The test contract receives all roles for deterministic unit tests.
        registry = new TicketSecurityRegistry(address(this), address(this), address(this));
        unauthorized = new UnauthorizedCaller();
    }

    // UNIT 1: happy path registration.
    function testRegisterTicket() public {
        registry.registerTicket(13001, ROUTE_A13, DATA_HASH);
        (bytes32 route, TicketSecurityRegistry.ValidationStatus status, bytes32 hashValue, bool exists) =
            registry.getTicket(13001);

        require(exists, "ticket must exist");
        require(route == ROUTE_A13, "route mismatch");
        require(status == TicketSecurityRegistry.ValidationStatus.Created, "wrong initial status");
        require(hashValue == DATA_HASH, "data hash mismatch");
        require(registry.ticketCount() == 1, "count mismatch");
    }

    // UNIT 2: duplicate registration must revert.
    function testDuplicateRegistrationReverts() public {
        registry.registerTicket(13001, ROUTE_A13, DATA_HASH);
        (bool ok,) = address(registry).call(
            abi.encodeCall(registry.registerTicket, (13001, ROUTE_A13, DATA_HASH))
        );
        require(!ok, "duplicate must revert");
    }

    // UNIT 3: invalid zero ticketId must revert.
    function testZeroTicketIdReverts() public {
        (bool ok,) = address(registry).call(
            abi.encodeCall(registry.registerTicket, (0, ROUTE_A13, DATA_HASH))
        );
        require(!ok, "zero ticket id must revert");
    }

    // UNIT 4: caller without OPERATOR_ROLE cannot register.
    function testUnauthorizedRegisterReverts() public {
        (bool ok,) = address(unauthorized).call(
            abi.encodeCall(unauthorized.register, (registry, 13002, ROUTE_A13, DATA_HASH))
        );
        require(!ok, "unauthorized register must revert");
    }

    // UNIT 5: Created -> Validated transition.
    function testValidateTicket() public {
        registry.registerTicket(13003, ROUTE_A13, DATA_HASH);
        registry.validateTicket(13003);
        (, TicketSecurityRegistry.ValidationStatus status,,) = registry.getTicket(13003);
        require(status == TicketSecurityRegistry.ValidationStatus.Validated, "must be validated");
    }

    // UNIT 6: ticket can be revoked.
    function testRevokeTicket() public {
        registry.registerTicket(13004, ROUTE_A13, DATA_HASH);
        registry.revokeTicket(13004);
        require(registry.isRevoked(13004), "must be revoked");
    }

    // UNIT 7: revoked ticket cannot be reactivated.
    function testRevokedTicketCannotValidate() public {
        registry.registerTicket(13005, ROUTE_A13, DATA_HASH);
        registry.revokeTicket(13005);
        (bool ok,) = address(registry).call(abi.encodeCall(registry.validateTicket, (13005)));
        require(!ok, "revoked ticket must not validate");
        require(registry.isRevoked(13005), "revocation must remain terminal");
    }

    // UNIT 8: AUDITOR_ROLE can use the restricted audit function.
    function testAuditorRead() public {
        registry.registerTicket(13006, ROUTE_A13, DATA_HASH);
        (bytes32 route, TicketSecurityRegistry.ValidationStatus status, bytes32 hashValue) =
            registry.auditTicket(13006);
        require(route == ROUTE_A13, "route mismatch");
        require(status == TicketSecurityRegistry.ValidationStatus.Created, "status mismatch");
        require(hashValue == DATA_HASH, "hash mismatch");
    }

    // FUZZ 1: for arbitrary valid values, registration preserves the exact record.
    function testFuzzRegistration(uint256 ticketId, bytes32 routeCode, bytes32 dataHash) public {
        if (ticketId == 0) ticketId = 1;
        if (routeCode == bytes32(0)) routeCode = bytes32("FUZZ_ROUTE");
        if (dataHash == bytes32(0)) dataHash = keccak256("FUZZ_DATA");

        registry.registerTicket(ticketId, routeCode, dataHash);
        (bytes32 storedRoute, TicketSecurityRegistry.ValidationStatus status, bytes32 storedHash, bool exists) =
            registry.getTicket(ticketId);

        require(exists, "fuzz: missing ticket");
        require(storedRoute == routeCode, "fuzz: route mismatch");
        require(storedHash == dataHash, "fuzz: hash mismatch");
        require(status == TicketSecurityRegistry.ValidationStatus.Created, "fuzz: status mismatch");
    }

    // FUZZ 2 / security property: after revocation, validation must always fail.
    function testFuzzRevocationIsTerminal(uint256 ticketId) public {
        if (ticketId == 0) ticketId = 1;

        registry.registerTicket(ticketId, ROUTE_A13, DATA_HASH);
        registry.revokeTicket(ticketId);

        (bool ok,) = address(registry).call(abi.encodeCall(registry.validateTicket, (ticketId)));
        require(!ok, "fuzz: revoked ticket reactivated");
        require(registry.isRevoked(ticketId), "fuzz: revoked state changed");
    }
}
