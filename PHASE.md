# Текущее состояние

**Репозиторий:** https://github.com/pashhha33/meta-kb-obsidian
**Фаза:** IMPL-PLUGIN
**Итерация:** ITER-2026-11-14-9
**Статус:** completed
**Версия плагина:** 0.4.0 (`plugin/manifest.json`, `plugin/package.json`, `plugin/package-lock.json`); поднимается в ветке итерации, проверяется воротами G2b. Контракт: schemaVersion 1.4.0, настроек 14.
**Цель итерации:** Логирование: `core/logging.ts` (уровень-порог `silent`/`error`/`warn`/`info`/`debug`, кольцевой буфер 500 записей, приёмник для консоли), настройки `logLevel` и `logToConsole` в контракте и в Settings, команда «Показать лог» и группа «Диагностика» в окне команд; все 25 вызовов `console.*` переведены на логгер.
**Предыдущая итерация:** ITER-2026-11-14-8 (Validation: движок правил, 9 из 23, бейдж находок в шапке виджета) — completed.
**Установлено в vault:** `meta-kb-obsidian_Valte/.obsidian/plugins/meta_kb` — обновляется командой `node tools/install-vault.mjs --vault <путь>`; после установки перезагрузить плагин в Obsidian.
**Следующее действие:** Validation, срез 2 — оставшиеся 14 правил (граф и определения: `extends-acyclic`/`extends-depth`, `defined-by-consistent`, `unique-machine-keys`, `trigger-values-subset`, `expansion-keys-exist`, `relation-acyclic`, `relation-endpoints-match`, `relation-cardinality-form`, `facet-target-is-facet`, `chapter-position-unique`, `chapter-of-required`, `collection-element-consistent`, `orphan-attachment`), команда «Проверить хранилище» с модалкой отчёта и иконки находок в строках полей. Версия среза — 0.5.0. После этого: C-IMG-03 (hover-иконки, нужна ручная проверка в Live Preview), C-IMG-02 (колонка «изображение» в Bases).