# Текущее состояние

**Репозиторий:** https://github.com/pashhha33/meta-kb-obsidian
**Фаза:** IMPL-PLUGIN
**Итерация:** ITER-2026-11-14-1
**Статус:** completed
**Цель итерации:** Создание объекта (команда `Create object`: файл `{type}_{id}.md` с универсальным ядром свойств, UUIDv7, `defined_by` из определения типа) и bootstrap метамодели (10 метатипов + определения 29 типов ядра). Исправлен контракт: `layer` метатипов приведён к `system`, слой определяемых объектов вынесен в `defines_layer` (schemaVersion 1.1.0).
**Предыдущая итерация:** ITER-2026-11-14-0 (виджет как форма по типу, FE-поля, вычисляемые `char-count`/`author-sheets`) — completed.
**Установлено в vault:** `meta-kb-obsidian_Valte/.obsidian/plugins/meta_kb` — обновляется командой `node tools/install-vault.mjs --vault <путь>`; после установки перезагрузить плагин в Obsidian.
**Следующее действие:** Создание главы как отдельный сценарий (ADR-002: запросы book/position/title, навигация, объём книги) — сейчас `chapter` создаётся обычным объектом без `chapter-of`.
