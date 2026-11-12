# Practical Work №3 — Variant 13

Готовый каркас под задание «Разработка и безопасность смарт-контрактов».

## Что уже подготовлено

- secure `TicketSecurityRegistry.sol` на OpenZeppelin AccessControl;
- роли OPERATOR_ROLE / AUDITOR_ROLE + admin role;
- 6 public/external функций, 2 события, custom errors, input validation;
- 8 unit tests;
- 2 built-in Hardhat Solidity fuzz tests;
- отдельный vulnerable contract с `tx.origin`;
- специальный attacker contract;
- threat model (7 угроз);
- 4 security invariants;
- PlantUML architecture;
- Slither guide;
- vulnerability reproduction guide;
- local/Sepolia demo plan;
- report template, screenshot checklist, defense cheat sheet;
- Codex prompt для финального DOCX.

## 1. Установка

PowerShell:

```powershell
cd <распакованная-папка>
npm.cmd install
npm.cmd run compile
npm.cmd run test
```

Node.js для Hardhat 3 должен быть современным; ваша ранее установленная Node 24 подходит по минимальному требованию Hardhat 3.

## 2. Что прислать ChatGPT после запуска

Пришлите вывод:

```powershell
npm.cmd run compile
npm.cmd run test
```

Если тесты зелёные, затем перейдём к:

1. локальному deploy/demonstration;
2. Slither;
3. контролируемому exploit `tx.origin`;
4. proof of fix;
5. Sepolia deploy исправленного контракта;
6. финальному отчёту.

## Безопасность

- vulnerable contract использовать только local/testnet;
- не отправлять и не сохранять в репозитории seed/private key;
- screenshots не должны содержать секреты;
- Sepolia — только исправленная версия.
