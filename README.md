# meta-kb-obsidian

Метамодель личной базы знаний + плагин Obsidian для её поддержки.

**Это единственный канон проекта.** Все прочие каталоги под `Документы/Метамодель/` устарели и помечены как `DEPRECATED`.

## Быстрый старт

1. `PHASE.md` — актуальное состояние: фаза, итерация, следующее действие.
2. `WORKFLOW.md` — процесс v2 (три контура, четыре ворот, цикл итерации).
3. `INSTRUCTIONS/` — правила ролей: чат / агент / пользователь.

## Три контура (процесс v2)

| Контур | Что это | Где |
|---|---|---|
| **A. Семантика** | проза: «что означает и почему» | `metamodel/` |
| **B. Контракт** | машинный вход для кода | `schema/metamodel.json` |
| **C. Код** | плагин Obsidian + приёмка | `plugin/`, `fixtures/vault/`, `tests/` |

Проза отвечает за смысл, контракт — за данные, код читает контракт. Сверка в обе стороны — `tools/schema-check.mjs`.

## Ворота качества

Все ворота одной командой:

```bash
node tools/check-all.mjs
```

По отдельности:

```bash
node tools/check-state.mjs    # G1: PHASE.md ↔ iterations/
node tools/schema-check.mjs   # G2: валидность контракта + сверка с прозой
cd plugin && npm run build    # G3a: tsc + esbuild
cd plugin && npm test         # G3b: node:test (чистая логика)
cd plugin && npm run check:bundle   # G3c: собранный main.js реально загружается
node tools/accept.mjs         # G4: приёмка на fixtures/vault
```

**G3c обязателен:** `tsc` и esbuild не ловят циклические импорты, при которых
класс наследует `undefined`. Такой бандл собирается без ошибок, но падает в
Obsidian при включении плагина (`Class extends value undefined`). Ворота
загружают `main.js` в Node с заглушкой `obsidian` и проверяют экспорт класса
плагина. Дополнительно можно проверить произвольный бандл:
`node tools/check-bundle.mjs --file <путь>`.

## Установка в vault

```bash
cd plugin && npm run build
node tools/install-vault.mjs --vault "<путь к vault>"
```

Скрипт кладёт `manifest.json`, `main.js`, `styles.css` в папку уже
установленного плагина (по `manifest.id`) и пишет `installed.json` с версией и
git-ревизией — чтобы всегда знать, что стоит в хранилище.

После установки плагин нужно перезагрузить в Obsidian (выключить и включить,
либо `Ctrl+R`).

Подробно — `WORKFLOW.md`.
