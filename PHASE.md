# Текущее состояние

**Репозиторий:** https://github.com/pashhha33/meta-kb-obsidian
**Фаза:** IMPL-PLUGIN
**Итерация:** ITER-2026-11-14-5
**Статус:** completed
**Цель итерации:** A3 — вставка изображения из буфера обмена (C-IMG-04 п.2): команда и кнопка «Из буфера», файл `Pasted image ….png` в папке вложений из настроек Obsidian, `ensureImageWrapper` поверх него; попутно исправлен `normalizeAttachmentPath` (конечный слэш).
**Предыдущая итерация:** ITER-2026-11-14-4 (миниатюры `media`/`list<media>` в строке свойств по DESIGN §6) — completed.
**Установлено в vault:** `meta-kb-obsidian_Valte/.obsidian/plugins/meta_kb` — обновляется командой `node tools/install-vault.mjs --vault <путь>`; после установки перезагрузить плагин в Obsidian.
**Следующее действие:** C-IMG-03 — hover «создать / открыть обёртку» над изображением в теле заметки (затрагивает Live Preview, нужна ручная проверка в Obsidian). Затем по приоритету: слой Validation (23 правила контракта, INV-24 через `requiredFor`, иконка-warning для битых `link`/`media`), либо C-IMG-02 (колонка «изображение» в Bases).