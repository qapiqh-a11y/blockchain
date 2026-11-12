# Slither — практический план

## Что анализируем

1. `contracts/vulnerable/VulnerableTicketRegistry.sol` — намеренно содержит `tx.origin` для авторизации.
2. `contracts/TicketSecurityRegistry.sol` — исправленная основная версия с OpenZeppelin AccessControl.

## Установка (лучше в отдельном Python venv/WSL)

```bash
python -m pip install -U slither-analyzer solc-select
solc-select install 0.8.28
solc-select use 0.8.28
```

Сначала убедиться, что Hardhat-компиляция работает:

```powershell
npm.cmd run compile
```

## Анализ уязвимой версии

```powershell
slither contracts/vulnerable/VulnerableTicketRegistry.sol 2>&1 | Tee-Object reports/slither-vulnerable.txt
```

Ожидаемый ключевой finding: использование `tx.origin` для авторизации (`tx-origin`).

## Анализ исправленной версии

Из-за импорта OpenZeppelin используйте remapping:

```powershell
slither contracts/TicketSecurityRegistry.sol --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" 2>&1 | Tee-Object reports/slither-secure.txt
```

Если file-level анализ не разрешает импорт, попробуйте из корня проекта:

```powershell
slither . --compile-force-framework hardhat 2>&1 | Tee-Object reports/slither-project.txt
```

### Важная оговорка

В 2026 были сообщения о несовместимости отдельных версий Slither/crytic-compile с форматом build-info Hardhat 3. Если `slither .` падает при том, что `hardhat compile` успешен, это не доказывает ошибку контракта. Для отчёта сохраните текст ошибки и выполните file-level анализ через solc/remapping либо Slither в WSL/отдельном окружении.

## Классификация findings

В отчёте сделайте таблицу:

| Finding | Контракт | Класс | Решение |
|---|---|---|---|
| `tx-origin` | VulnerableTicketRegistry | Реальная уязвимость | Удалить tx.origin-auth, применить msg.sender + AccessControl |
| pragma/info/optimization и т.п. | по факту | informational/false positive | Обосновать |

Нельзя писать «Slither ничего не нашёл = контракт безопасен». Slither не понимает полностью бизнес-логику и trust model.
