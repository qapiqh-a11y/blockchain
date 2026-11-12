# Practical Work №5 — Task 3: Security Telemetry and Threat Monitoring

## Что реализовано

Dashboard собирает три категории телеметрии:

1. `CONTRACT_EVENT` — подтверждённые события `TicketRegistered` и `TicketStatusChanged`.
2. `TX_RECEIPT` — квитанции транзакций со статусом, блоком, hash и `gasUsed`.
3. `APP_RPC_FAILURE` — ошибки приложения, MetaMask и JSON-RPC, включая отклонённые EVM-вызовы.

Каждая запись содержит UTC timestamp и correlation ID. Правила обнаружения:

- `SEC-001_UNAUTHORIZED_ACCESS` — попытка вызова функции без требуемой роли, High.
- `OPS-001_RPC_FAILURE` — сетевой, серверный, timeout или другой операционный RPC-сбой, Medium.

Одинаковые alert-записи объединяются по ключу правила, адресу и операции. Повторная попытка увеличивает `occurrences`, не создавая alert spam.

> Отклонённый EVM-вызов не сохраняет событие контракта. Поэтому попытка нарушения доступа фиксируется по ошибке RPC/приложения, а успешная операция — по receipt и событию контракта.

## Запуск локальной демонстрации

Открой три окна PowerShell.

### Терминал 1 — локальный Hardhat node

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3"
npm.cmd run node
```

Не закрывай окно.

### Терминал 2 — deployment и проверка

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3"
npm.cmd run compile
node .\scripts\deploy-pr5.mjs
Copy-Item .\reports\pr5-deployment.json .\web3-client\src\deployment.json -Force

npm.cmd test
node --test .\scripts\pr5-integration-tests.mjs
```

Ожидаемый адрес первого deployment на чистом Hardhat node:

```text
0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Терминал 3 — React Dashboard

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3\web3-client"
npm.cmd run test:monitoring
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1
```

Открой адрес Vite, обычно `http://127.0.0.1:5173`.

В MetaMask должна быть сеть:

```text
Network name: Hardhat Local
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency: ETH
```

## Скриншот №16 — Security Monitoring Dashboard

Имя файла: `16_security_monitoring_dashboard.png`.

Для самого убедительного кадра сначала выполни сценарии №17 и обычную
транзакцию OPERATOR без очистки журнала. Тогда все три счётчика будут больше
нуля. После этого нажми `Refresh On-chain Events`.

Раскрой окно браузера так, чтобы были видны:

   - три счётчика `Contract events`, `Transaction receipts`, `App / RPC failures`;
   - `Detection Rules` с `SEC-001` и `OPS-001`;
   - таблица `Security Telemetry` с timestamp и correlation ID.

Это общий снимок реализованного мониторинга.

## Скриншот №17 — Access Violation Alert

Имя файла: `17_access_violation_alert.png`.

1. Нажми `Clear monitoring view`.
2. В MetaMask выбери первый Hardhat-аккаунт — ADMIN:

```text
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

3. Если Dashboard не обновил адрес автоматически, отключи и снова подключи сессию.
4. Убедись, что роль отображается как `ADMIN`.
5. Дважды нажми `Test unauthorized access rule`.

Ожидаемый результат:

- красный статус `ALERT TRIGGERED`;
- правило `SEC-001_UNAUTHORIZED_ACCESS`;
- `Active Alerts = 1`;
- в alert-карточке `2 occurrence(s)` — доказательство дедупликации;
- в телеметрии две ошибки `APP_RPC_FAILURE` с разными correlation ID.

На снимке должны одновременно быть видны красный статус, alert-карточка и correlation ID.

## Скриншот №18 — Normal Operation Without Alerts

Имя файла: `18_normal_operation_no_alert.png`.

1. Нажми `Clear monitoring view`.
2. В MetaMask выбери второй Hardhat-аккаунт — OPERATOR:

```text
0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

3. Убедись, что Dashboard показывает роль `OPERATOR`.
4. Нажми `Run normal operator transaction`.
5. Подтверди транзакцию в MetaMask.

Ожидаемый результат:

- зелёный статус `NORMAL · NO ALERT`;
- `Active Alerts = 0` и `No active security alerts`;
- `Transaction receipts = 1`;
- `Contract events = 1`;
- `App / RPC failures = 0`;
- receipt и event имеют одинаковый correlation ID и один transaction hash.

На снимке должны одновременно быть видны зелёный статус, нулевой счётчик alert и строки receipt/event.

## Автоматическая проверка мониторинга

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3\web3-client"
npm.cmd run test:monitoring
npm.cmd run lint
npm.cmd run build
```

Тесты проверяют оба правила, отсутствие alert для обычной бизнес-ошибки, обязательные поля телеметрии и объединение повторных alert-записей.
