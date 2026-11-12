// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TicketSecurityRegistry
/// @notice Variant 13 (Transport): secure registration of electronic ticket events.
/// @dev Only minimal public data is stored on-chain. Sensitive ticket documents stay off-chain;
///      dataHash can be used to prove integrity of the protected off-chain record.
contract TicketSecurityRegistry is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    enum ValidationStatus {
        Created,
        Validated,
        Revoked
    }

    struct Ticket {
        bytes32 routeCode;
        ValidationStatus validationStatus;
        bytes32 dataHash;
        bool exists;
    }

    mapping(uint256 ticketId => Ticket) private _tickets;

    uint256 public ticketCount;

    event TicketRegistered(
        uint256 indexed ticketId,
        bytes32 indexed routeCode,
        bytes32 indexed dataHash,
        address operator
    );

    event TicketStatusChanged(
        uint256 indexed ticketId,
        ValidationStatus previousStatus,
        ValidationStatus newStatus,
        address operator
    );

    error InvalidAddress();
    error InvalidTicketId();
    error InvalidRouteCode();
    error InvalidDataHash();
    error TicketAlreadyExists(uint256 ticketId);
    error TicketNotFound(uint256 ticketId);
    error InvalidStatusTransition(
        uint256 ticketId,
        ValidationStatus currentStatus,
        ValidationStatus requestedStatus
    );

    constructor(address admin, address operator, address auditor) {
        if (admin == address(0) || operator == address(0) || auditor == address(0)) {
            revert InvalidAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
        _grantRole(AUDITOR_ROLE, auditor);
    }

    /// @notice Register a new electronic ticket event.
    function registerTicket(
        uint256 ticketId,
        bytes32 routeCode,
        bytes32 dataHash
    ) external onlyRole(OPERATOR_ROLE) {
        if (ticketId == 0) revert InvalidTicketId();
        if (routeCode == bytes32(0)) revert InvalidRouteCode();
        if (dataHash == bytes32(0)) revert InvalidDataHash();
        if (_tickets[ticketId].exists) revert TicketAlreadyExists(ticketId);

        _tickets[ticketId] = Ticket({
            routeCode: routeCode,
            validationStatus: ValidationStatus.Created,
            dataHash: dataHash,
            exists: true
        });

        unchecked {
            ticketCount += 1;
        }

        emit TicketRegistered(ticketId, routeCode, dataHash, msg.sender);
    }

    /// @notice Validate a ticket. A revoked ticket cannot be reactivated.
    function validateTicket(uint256 ticketId) external onlyRole(OPERATOR_ROLE) {
        Ticket storage ticket = _requireTicket(ticketId);
        if (ticket.validationStatus != ValidationStatus.Created) {
            revert InvalidStatusTransition(
                ticketId,
                ticket.validationStatus,
                ValidationStatus.Validated
            );
        }

        ValidationStatus oldStatus = ticket.validationStatus;
        ticket.validationStatus = ValidationStatus.Validated;
        emit TicketStatusChanged(ticketId, oldStatus, ValidationStatus.Validated, msg.sender);
    }

    /// @notice Revoke a ticket. Revocation is terminal in this educational design.
    function revokeTicket(uint256 ticketId) external onlyRole(OPERATOR_ROLE) {
        Ticket storage ticket = _requireTicket(ticketId);
        if (ticket.validationStatus == ValidationStatus.Revoked) {
            revert InvalidStatusTransition(
                ticketId,
                ticket.validationStatus,
                ValidationStatus.Revoked
            );
        }

        ValidationStatus oldStatus = ticket.validationStatus;
        ticket.validationStatus = ValidationStatus.Revoked;
        emit TicketStatusChanged(ticketId, oldStatus, ValidationStatus.Revoked, msg.sender);
    }

    /// @notice Public read of the minimal on-chain record.
    function getTicket(
        uint256 ticketId
    ) external view returns (bytes32 routeCode, ValidationStatus status, bytes32 dataHash, bool exists) {
        Ticket storage ticket = _tickets[ticketId];
        return (ticket.routeCode, ticket.validationStatus, ticket.dataHash, ticket.exists);
    }

    /// @notice Restricted audit view to demonstrate a second operational role.
    /// @dev Access restriction does NOT make public blockchain storage confidential.
    function auditTicket(
        uint256 ticketId
    ) external view onlyRole(AUDITOR_ROLE) returns (bytes32 routeCode, ValidationStatus status, bytes32 dataHash) {
        Ticket storage ticket = _requireTicket(ticketId);
        return (ticket.routeCode, ticket.validationStatus, ticket.dataHash);
    }

    function isRevoked(uint256 ticketId) external view returns (bool) {
        Ticket storage ticket = _requireTicket(ticketId);
        return ticket.validationStatus == ValidationStatus.Revoked;
    }

    function _requireTicket(uint256 ticketId) internal view returns (Ticket storage ticket) {
        ticket = _tickets[ticketId];
        if (!ticket.exists) revert TicketNotFound(ticketId);
    }
}
