# Текущее состояние

**Репозиторий:** https://github.com/pashhha33/meta-kb-obsidian
**Фаза:** IMPL-PLUGIN
**Итерация:** ITER-2026-11-15-17
**Статус:** completed
**Версия плагина:** 0.12.0 (`plugin/manifest.json`, `plugin/package.json`, `plugin/package-lock.json`); поднимается в ветке итерации, проверяется воротами G2b. Контракт: schemaVersion 1.6.0, настроек 14, правил валидации 26 — все реализованы.
**Цель итерации:** C-IMG-02 — превью картинки обёртки в представлении карточек: обратный индекс `AttachmentIndex.byId` + `wrapperForId`, `ui/CardImage.ts` (фабрика, не web-компонент — иначе бандл не грузится в G3c), API `getImageWrapperPreview`, команда «Представление карточек» с сеткой превью и переходом к обёртке.
**Предыдущая итерация:** ITER-2026-11-15-16 (правила `type-known` INV-04 и `title-required` INV-07) — completed.
**Установлено в vault:** `meta-kb-obsidian_Valte/.obsidian/plugins/meta_kb` — обновляется командой `node tools/install-vault.mjs --vault <путь>`; после установки перезагрузить плагин в Obsidian.
**Следующее действие:** фильтр и сортировка в карточной панели (по типу/дате/роли), затем настройки контракта без интерфейса (`strictValidation`, `propertiesWidgetLocation`). Отдельно: если нужна колонка именно внутри Bases — требуется ADR на новое свойство-ссылку (INV-23 запрещает хранить в `attachment` ссылку). Версия следующего среза — 0.13.0.