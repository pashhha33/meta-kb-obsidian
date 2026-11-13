# meta-kb-obsidian

Метамодель личной базы знаний + плагин Obsidian для её поддержки.

**Это единственный канон проекта.** Все прочие каталоги под `Документы/Метамодель/` устарели и помечены как `DEPRECATED`.

## Быстрый старт

1. `PHASE.md` — актуальное состояние: фаза, итерация, следующее действие.
2. `WORKFLOW.md` — процесс v2 (три контура, четыре ворота, цикл итерации).
3. `INSTRUCTIONS/` — правила ролей: чат / агент / пользователь.

## Три контура (процесс v2)

| Контур | Что это | Где |
|---|---|---|
| **A. Семантика** | проза: «что означает и почему» | `metamodel/` |
| **B. Контракт** | машинный вход для кода | `schema/metamodel.json` |
| **C. Код** | плагин Obsidian + приёмка | `plugin/`, `fixtures/vault/`, `tests/` |

Проза отвечает за смысл, контракт — за данные, код читает контракт. Сверка в обе стороны — `tools/schema-check.mjs`.

## Ворота качества

```bash
node tools/check-state.mjs    # G1: PHASE.md ↔ iterations/
node tools/schema-check.mjs   # G2: валидность контракта + сверка с прозой
node tools/accept.mjs         # G4: приёмка на fixtures/vault
cd plugin && npm run build    # G3: tsc + esbuild
cd plugin && npm test         # G3: node:test (чистая логика)
node tools/install-vault.mjs --vault "<путь>"   # доставка в vault + installed.json
```

Подробно — `WORKFLOW.md`.
