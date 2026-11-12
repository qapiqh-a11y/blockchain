# Демонстрация Practical Work №3

## A. Подготовка

```powershell
cd <project-folder>
npm.cmd install
npm.cmd run compile
npm.cmd run test
```

Для скриншота тестов нужен итог с минимум 8 unit tests и 2 fuzz tests.

## B. Локальная сеть Hardhat

Терминал 1:

```powershell
npm.cmd run node
```

Не закрывать.

### Подключение Remix/MetaMask к локальной сети

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency: ETH
- Импортировать **только один из тестовых private keys, напечатанных Hardhat node**. Эти ключи публично известны и годятся только для локальной сети. Никогда не использовать их в mainnet/testnet кошельке с ценными активами.
- Не включать private key в отчёт или screenshot.

### Deploy secure contract

Constructor:

- `admin`: local account #0
- `operator`: local account #1 (или #0 для упрощённой демонстрации)
- `auditor`: local account #2

Показать минимум:

1. `registerTicket(13001, bytes32("A13"), <keccak256 hash>)`
2. `getTicket(13001)` READ
3. `validateTicket(13001)` WRITE
4. `auditTicket(13001)` от auditor
5. `revokeTicket(13001)` WRITE
6. Попытка `validateTicket(13001)` после revoke → revert.

## C. Уязвимая версия (только local)

Следовать `docs/VULNERABILITY_DEMO_RU.md`.

## D. Sepolia — только исправленный контракт

Использовать существующий тестовый MetaMask Sepolia account.

Deploy `TicketSecurityRegistry` через Remix Browser Wallet.

Constructor рекомендуется:

- admin = ваш Sepolia test EOA
- operator = тот же test EOA (для удобства демонстрации)
- auditor = тот же test EOA (для удобства лабораторной)

После deployment сохранить:

- secure contract address;
- deployment tx hash.

Сделать минимум две interaction tx:

1. `registerTicket(13013, bytes32("A13"), <dataHash>)`
2. `validateTicket(13013)`
3. дополнительно можно `revokeTicket(13013)`.

Сохранить минимум 2 interaction tx hashes и ссылки block explorer.

### Как получить bytes32 routeCode в Remix

Можно использовать 32-byte hex. Например ASCII `A13` с нулями справа:

`0x4131330000000000000000000000000000000000000000000000000000000000`

### Как получить dataHash

В браузерной console/ethers либо любым keccak256-инструментом вычислить hash тестовой строки. Не хешировать реальные персональные данные для отчёта; используйте синтетическую строку вроде `ticket-13013-demo`.
