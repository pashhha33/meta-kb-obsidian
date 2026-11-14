# Текущее состояние

**Репозиторий:** https://github.com/pashhha33/meta-kb-obsidian
**Фаза:** IMPL-PLUGIN
**Итерация:** ITER-2026-11-14-7
**Статус:** completed
**Версия плагина:** 0.2.0 (`plugin/manifest.json`, `plugin/package.json`, `plugin/package-lock.json`); поднимается в ветке итерации, проверяется воротами G2b.
**Цель итерации:** Версия перестаёт застревать: ворота G2b (`tools/check-version.mjs`) сверяют `manifest.json` ↔ `package.json` ↔ `package-lock.json` и формат `MAJOR.MINOR.PATCH`; правило подъёма версии записано в `WORKFLOW.md` (§5, §8 п.7).
**Предыдущая итерация:** ITER-2026-11-14-6 (окно команд «Команды Meta KB», все команды переименованы на русский) — completed.
**Установлено в vault:** `meta-kb-obsidian_Valte/.obsidian/plugins/meta_kb` — обновляется командой `node tools/install-vault.mjs --vault <путь>`; после установки перезагрузить плагин в Obsidian.
**Следующее действие:** слой Validation — 23 правила контракта в `src/core/validation.ts` (чистая логика, покрывается тестами): INV-24 через `requiredFor`, enum, битые ссылки `link`/`media`, дубли `attachment` (C-IMG-05); в UI — иконка-warning в строке свойств и команда проверки. Версия среза — 0.3.0. После него: C-IMG-03 (hover-иконки, нужна ручная проверка в Live Preview), C-IMG-02 (колонка «изображение» в Bases).