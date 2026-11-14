# Текущее состояние

**Репозиторий:** https://github.com/pashhha33/meta-kb-obsidian
**Фаза:** IMPL-PLUGIN
**Итерация:** ITER-2026-11-14-8
**Статус:** completed
**Версия плагина:** 0.3.0 (`plugin/manifest.json`, `plugin/package.json`, `plugin/package-lock.json`); поднимается в ветке итерации, проверяется воротами G2b.
**Цель итерации:** Слой Validation, срез 1: движок правил `src/core/validation.ts` (9 правил из 23 контракта: `unique-id`, `filename-matches-object`, `aliases-first-equals-title`, `image-has-attachment`, `image-attachment-unique`, `link-target-exists`, `media-target-is-image`, `inactive-field-value`, `deprecated-link-target`) + бейдж находок в шапке виджета; 15 новых тестов.
**Предыдущая итерация:** ITER-2026-11-14-7 (ворота версии G2b, bump до 0.2.0) — completed.
**Установлено в vault:** `meta-kb-obsidian_Valte/.obsidian/plugins/meta_kb` — обновляется командой `node tools/install-vault.mjs --vault <путь>`; после установки перезагрузить плагин в Obsidian.
**Следующее действие:** Validation, срез 2 — оставшиеся 14 правил (граф и определения: `extends-acyclic`/`extends-depth`, `defined-by-consistent`, `unique-machine-keys`, `trigger-values-subset`, `expansion-keys-exist`, `relation-acyclic`, `relation-endpoints-match`, `relation-cardinality-form`, `facet-target-is-facet`, `chapter-position-unique`, `chapter-of-required`, `collection-element-consistent`, `orphan-attachment`), команда «Проверить хранилище» с модалкой отчёта и иконки находок в строках полей. Версия среза — 0.4.0. После этого: C-IMG-03 (hover-иконки, нужна ручная проверка в Live Preview), C-IMG-02 (колонка «изображение» в Bases).