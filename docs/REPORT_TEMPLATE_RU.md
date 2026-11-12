# Практическая работа №3 — Разработка и безопасность смарт-контрактов

**Студент:** Kadyrzhan Paiyz  
**Группа:** SSE-2502M  
**Вариант:** 13  
**Отрасль:** Транспорт  
**Сценарий:** Регистрация события электронного билета  
**Данные:** ticketId, routeCode, validationStatus

## 1. Цель работы

Спроектировать и реализовать защищённый смарт-контракт варианта 13, провести функциональное и security testing, воспроизвести контролируемую уязвимость, выполнить Slither-анализ и подтвердить исправление.

## 2. Архитектура

Вставить `architecture/architecture.puml` (экспорт PNG/SVG).

### 2.1 Участники и роли

| Роль | Действия | Ограничения |
|---|---|---|
| DEFAULT_ADMIN_ROLE | назначение/отзыв ролей | production: multisig/timelock |
| OPERATOR_ROLE | register / validate / revoke | не управляет admin role |
| AUDITOR_ROLE | restricted audit read | не изменяет state |
| Passenger/User | чтение публичного статуса через dApp | нет write-доступа |

### 2.2 On-chain / off-chain

| On-chain | Off-chain |
|---|---|
| ticketId | персональные данные пассажира |
| routeCode | документ/QR payload/полная запись билета |
| validationStatus | закрытые бизнес-данные |
| dataHash | исходный документ |
| события | — |

Пояснить: dataHash подтверждает целостность off-chain записи, но не раскрывает её содержимое.

## 3. Threat model

Использовать `docs/THREAT_MODEL_RU.md`. Минимум 5 угроз.

## 4. Security invariants

Использовать `docs/INVARIANTS_RU.md`. Минимум 3.

## 5. Реализация безопасного контракта

- Solidity 0.8.28
- Hardhat 3.x
- OpenZeppelin Contracts 5.x AccessControl
- не менее 4 public/external functions
- 2 events
- OPERATOR_ROLE + AUDITOR_ROLE (+ DEFAULT_ADMIN_ROLE)
- custom errors/input validation

Вставить ключевой фрагмент `contracts/TicketSecurityRegistry.sol`.

## 6. Unit + fuzz testing

Команда:

```powershell
npm.cmd run test
```

Таблица:

| № | Test | Категория | Ожидаемый результат | Факт |
|---|---|---|---|---|
| 1 | testRegisterTicket | positive | pass | [ ] |
| 2 | testDuplicateRegistrationReverts | duplicate | pass | [ ] |
| 3 | testZeroTicketIdReverts | invalid input | pass | [ ] |
| 4 | testUnauthorizedRegisterReverts | access control | pass | [ ] |
| 5 | testValidateTicket | state transition | pass | [ ] |
| 6 | testRevokeTicket | state transition | pass | [ ] |
| 7 | testRevokedTicketCannotValidate | expected revert/invariant | pass | [ ] |
| 8 | testAuditorRead | role/read | pass | [ ] |
| 9 | testFuzzRegistration | fuzz | pass | [ ] |
| 10 | testFuzzRevocationIsTerminal | fuzz/security property | pass | [ ] |

Вставить screenshot полного результата.

## 7. Local deployment and functional demo

Указать local contract address и скрины register/read/validate/audit/revoke.

## 8. Уязвимая версия

**Выбранный дефект:** неправильная авторизация через `tx.origin`.

Первопричина: смешение origin всей транзакции и непосредственного caller контракта.

Вставить код vulnerable функции и attacker contract.

## 9. Slither

Приложить полный `reports/slither-vulnerable.txt` и по возможности `reports/slither-secure.txt`.

| Finding | Severity | Classification | Fix |
|---|---|---|---|
| tx.origin authorization | [по Slither] | real vulnerability | AccessControl / msg.sender |
| ... | ... | info / false positive | ... |

## 10. Эксплуатация

Показать последовательность:

Admin EOA → Attacker.attack() → Vulnerable.revokeTicket() → unauthorized state change.

Зафиксировать tx/event/status before-after.

## 11. Исправление и regression testing

Показать, что тот же attacker вызов против TicketSecurityRegistry завершается revert, status не меняется, а все unit/fuzz tests остаются зелёными.

## 12. Sepolia

**Secure contract address:** [FILL]  
**Deployment tx:** [FILL]  
**Interaction tx #1:** [FILL]  
**Interaction tx #2:** [FILL]

Добавить ссылки block explorer и screenshots.

## 13. Вывод

5–7 предложений: архитектура до кода; RBAC; off-chain confidential data + hash; unit/fuzz; Slither limits; reproduced tx.origin defect; fix through AccessControl; remaining risks (admin key, frontend/RPC/off-chain storage/manual business logic audit).

## 14. Контрольные вопросы

Использовать `docs/DEFENSE_CHEATSHEET_RU.md`.
