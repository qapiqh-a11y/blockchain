# Screenshot checklist

1. `npm.cmd run compile` — successful compilation + solc 0.8.28.
2. Secure contract code + roles/events in editor.
3. Architecture diagram.
4. `npm.cmd run test` — все unit/fuzz tests pass.
5. Hardhat local node запущен.
6. Local secure deployment address.
7. Local `registerTicket` WRITE.
8. Local `getTicket` READ result.
9. Local `validateTicket` + changed state.
10. Local revoke + failed re-validation (revert).
11. Vulnerable contract source с `tx.origin`.
12. Slither vulnerable report с `tx-origin` finding.
13. Vulnerable contract BEFORE attack.
14. Attacker `attack()` transaction / event.
15. Vulnerable contract AFTER attack: status Revoked.
16. Fixed secure contract: same attack → revert.
17. Regression test run after fix.
18. Sepolia secure deployment transaction.
19. Sepolia secure contract address / explorer.
20. Sepolia interaction tx #1.
21. Sepolia interaction tx #2.
22. Explorer logs/events for one interaction.

На скринах не должно быть seed phrase, private key, API key или секретных env-переменных.
