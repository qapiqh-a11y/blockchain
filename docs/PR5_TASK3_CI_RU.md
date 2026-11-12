# Practical Work №5 — Task 3: DevSecOps CI

## Состав pipeline

Workflow `.github/workflows/security-ci.yml` запускается при push и pull request
в `main`/`master`, а также вручную через `workflow_dispatch`.

### Job 1 — Quality and 27 tests

- установка зависимостей через `npm ci`;
- компиляция Solidity;
- 12 Solidity-тестов;
- запуск локального Hardhat RPC;
- 10 интеграционных и property-тестов;
- 5 тестов security monitoring;
- lint и production build React Dashboard;
- загрузка логов тестов и собранного Dashboard в Actions artifacts.

### Job 2 — npm audit and Slither

- npm audit корневого проекта и Dashboard;
- security gate корневых зависимостей на уровне Critical;
- security gate Dashboard на уровне High;
- Slither gate защищённого `TicketSecurityRegistry.sol` на High;
- отдельное сохранение ожидаемых findings намеренно уязвимого контракта и
  атакующего контракта;
- загрузка JSON-отчётов в Actions artifacts.

Намеренно уязвимый контракт не ломает pipeline: его finding `tx.origin`
сохраняется как учебное доказательство. Защищённый контракт проверяется отдельным
блокирующим gate.

## Локальная проверка перед GitHub

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3"

npm.cmd ci
npm.cmd run compile
npm.cmd test

cd .\web3-client
npm.cmd ci
npm.cmd run test:monitoring
npm.cmd run lint
npm.cmd run build
```

Интеграционные тесты запускаются при работающем Hardhat node:

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3"
npm.cmd run node
```

Во втором PowerShell:

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3"
node .\scripts\wait-for-rpc.mjs
node --test .\scripts\pr5-integration-tests.mjs
```

## Публикация в GitHub

Проект пока не является Git-репозиторием. Создай пустой репозиторий на GitHub,
затем выполни, подставив свой URL:

```powershell
cd "C:\Users\kadir\Documents\Q\projects\blockchain_pr3"

git init
git add .gitignore .github contracts docs scripts test web3-client `
  package.json package-lock.json hardhat.config.ts
git commit -m "Add Practical Work 5 security CI"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Не добавляй в GitHub seed phrase, private keys, `.env` или другие секреты.

## Скриншот №19 — GitHub Actions CI Pipeline

Имя файла: `19_github_actions_security_ci.png`.

1. Открой репозиторий на GitHub.
2. Перейди в `Actions` → `Security CI`.
3. Открой последний workflow run.
4. Убедись, что оба job зелёные:
   - `Quality and 27 tests`;
   - `npm audit and Slither`.
5. Раскрой job так, чтобы были видны успешные шаги тестов, npm audit и Slither.
6. В кадре должны присутствовать название workflow, commit, зелёный итог и оба
   job. Внизу run доступны artifacts:
   - `quality-test-evidence`;
   - `security-analysis-evidence`.
