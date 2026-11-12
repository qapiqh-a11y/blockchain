// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title VulnerableTicketRegistry
/// @notice Intentionally vulnerable educational contract.
/// @dev SECURITY DEFECT: tx.origin is used for authorization in revokeTicket().
///      Run ONLY locally or in a test network.
contract VulnerableTicketRegistry {
    enum ValidationStatus {
        Created,
        Validated,
        Revoked
    }

    struct Ticket {
        bytes32 routeCode;
        ValidationStatus status;
        bool exists;
    }

    address public immutable admin;
    mapping(uint256 => Ticket) private _tickets;

    event TicketRegistered(uint256 indexed ticketId, bytes32 indexed routeCode);
    event TicketRevoked(uint256 indexed ticketId, address indexed immediateCaller, address indexed origin);

    constructor(address initialAdmin) {
        require(initialAdmin != address(0), "zero admin");
        admin = initialAdmin;
    }

    function registerTicket(uint256 ticketId, bytes32 routeCode) external {
        require(msg.sender == admin, "not admin");
        require(ticketId != 0, "bad id");
        require(routeCode != bytes32(0), "bad route");
        require(!_tickets[ticketId].exists, "duplicate");

        _tickets[ticketId] = Ticket(routeCode, ValidationStatus.Created, true);
        emit TicketRegistered(ticketId, routeCode);
    }

    /// @dev VULNERABLE: a malicious intermediate contract can preserve tx.origin == admin.
    function revokeTicket(uint256 ticketId) external {
        require(tx.origin == admin, "origin is not admin");
        require(_tickets[ticketId].exists, "not found");

        _tickets[ticketId].status = ValidationStatus.Revoked;
        emit TicketRevoked(ticketId, msg.sender, tx.origin);
    }

    function getTicket(uint256 ticketId) external view returns (bytes32 routeCode, ValidationStatus status, bool exists) {
        Ticket memory ticket = _tickets[ticketId];
        return (ticket.routeCode, ticket.status, ticket.exists);
    }
}
