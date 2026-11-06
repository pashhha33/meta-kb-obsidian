### AGENT-TASK
**Итерация:** ITER-2026-11-06-0  
**Цель:** Каркас Properties Widget + hide core Properties  

**Файлы (создать/изменить):**
- `plugin/src/main.ts` — onload: register view, settings, CSS hide
- `plugin/src/settings.ts` — hideCoreProperties, datetimeDisplay, booleanWriteFalse
- `plugin/src/ui/PropertiesView.ts` — ItemView, привязка к active file
- `plugin/src/ui/FieldRow.ts` — label, summary, button
- `plugin/src/ui/modals/FieldModal.ts` — shell OK/Cancel/Clear
- `plugin/src/ui/modals/types/*.ts` — String, Number, Boolean, Enum, Date (заглушки link/media)
- `plugin/styles.css` — hide `.metadata-container` when setting on
- `plugin/manifest.json` / `package.json` — при необходимости

**Требования:**
1. View «Meta KB Properties» в right sidebar; обновляется при смене active file.
2. Пока **без** полного Registry: читать frontmatter активного файла через metadataCache + processFrontMatter для записи.
3. Labels: map из статического stub (occupation → Профессия, …) или key, если нет в map; позже — definitions из vault.
4. Модалки string/number/boolean/enum/date — рабочие; link/media — modal shell «TODO».
5. `hideCoreProperties: true` по умолчанию — CSS hide core properties.
6. Не ломать открытие vault, если frontmatter битый.

**Критерии приёмки:**
- Открыть заметку с YAML → в sidebar видны поля с labels (хотя бы stub).
- Изменить string через модалку → frontmatter обновлён.
- Boolean toggle в строке меняет значение.
- Core Properties скрыты при default settings.
- Команда «Open properties widget» открывает leaf.