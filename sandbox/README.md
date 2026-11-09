# Результаты итерации ITER-2026-11-06-0 (Агент-реализатор)

**Задание:** `AGENT-TASK.md` — «Каркас Properties Widget + hide core Properties»
**Фаза:** DESIGN-PLUGIN → первый IMPL-срез виджета (см. `plugin/DESIGN.md` §7.8)

## Структура песочницы

```
sandbox/
├── README.md                     ← этот файл
├── patches/
│   ├── 0001-main.ts.diff         ← дифф plugin/src/main.ts (было → стало)
│   └── 0002-package.json.diff    ← дифф plugin/package.json
└── plugin/                       ← целевая структура (переносится в repo/plugin/)
    ├── manifest.json             (без изменений)
    ├── package.json              (обновлены devDependencies)
    ├── tsconfig.json             (новый)
    ├── esbuild.config.mjs        (новый)
    ├── styles.css                (новый: hide core Properties + стили виджета)
    ├── main.js                   (сборка esbuild, готов к установке в vault)
    └── src/
        ├── main.ts               (переписан: view, команда, настройки, CSS hide)
        ├── settings.ts           (новый: настройки, вкладка, formatDatetime)
        ├── labels.ts             (новый: статический stub labels/value_types/enums)
        └── ui/
            ├── PropertiesView.ts (новый: ItemView «Meta KB Properties»)
            ├── FieldRow.ts       (новый: строка поля: label, summary, ✎, toggle)
            └── modals/
                ├── FieldModal.ts     (новый: каркас OK/Отмена/Очистить)
                └── types/
                    ├── StringModal.ts   (string/text/list<string>/datetime)
                    ├── NumberModal.ts
                    ├── BooleanModal.ts
                    ├── EnumModal.ts     (enum/list<enum>, подписи RU)
                    ├── DateModal.ts
                    ├── LinkModal.ts     (заглушка TODO — ждёт Registry)
                    └── MediaModal.ts    (заглушка TODO — ждёт Registry)
```

## Перенос в репозиторий

Скопировать содержимое `sandbox/plugin/` в `plugin/` репозитория
(кроме `main.js`, `package-lock.json`, `node_modules/` — это сборочные артефакты),
либо применить `patches/*.diff` через `git apply -p1` и добавить новые файлы.

## Сборка и отладка

```bash
cd plugin
npm install
npm run build   # tsc -noEmit (типы) + esbuild production → main.js
npm run dev     # esbuild watch + inline sourcemaps (горячая пересборка)
```

Установка в vault для ручной приёмки: скопировать `manifest.json`, `main.js`,
`styles.css` в `.obsidian/plugins/meta-kb/` и включить плагин.

## Что сделано (по требованиям задания)

1. ✅ View «Meta KB Properties» в правой боковой панели, обновляется при
   смене active file (`active-leaf-change`, `file-open`, `layout-change`,
   `metadataCache.changed` — с debounce 100 мс).
2. ✅ Без Registry: чтение через `metadataCache.getFileCache`, запись через
   `fileManager.processFrontMatter`.
3. ✅ Labels из статического stub (`src/labels.ts`, источник — metamodel v1:
   properties/relations/ontology/types), неизвестный ключ → label = key.
4. ✅ Модалки string/number/boolean/enum/date — рабочие; link/media —
   shell «TODO» (OK отключён, «Очистить» работает).
5. ✅ `hideCoreProperties: true` по умолчанию; класс на `<body>` + правило
   в `styles.css`.
6. ✅ Битый frontmatter не ломает vault: try/catch вокруг кэша и отрисовки,
   плагин ничего не пишет при загрузке.

Проверки: `tsc -noEmit` (strict) — 0 ошибок; `esbuild` — main.js собран;
22 smoke-теста чистой логики (labels, parseCanonicalLink, formatDatetime,
DEFAULT_SETTINGS) — пройдены.

## Интерпретации в рамках задания

- `src/labels.ts` — новый файл под требование 3 (статический stub map);
  в задании явно не перечислен, но без него требование нереализуемо.
- `datetimeOffset` добавлен к трём настройкам из задания: нужен режиму
  `fixed-offset` из `metamodel/plugin-settings.md`.
- `list<string>` редактируется в StringModal (textarea, «одно значение на
  строку»), `list<enum>` — чекбоксами в EnumModal: иначе `aliases` и
  `occupation` — самые частые поля — остаются нередактируемыми.
- Кардинальность в подзаголовке модалки не показывается (нет определений);
  «Очистить» для обязательных полей не блокируется — тоже ждёт Schema.

## Что осталось (следующие срезы, DESIGN.md §7.8)

- Loader + Registry + Schema (effective fields, field_order, field-expansion).
- Полноценные модалки link/media (suggest из Registry, media-превью, INV-23).
- updated_at при значимых изменениях (модуль Derived, ADR-004).
- Enum cycle в строке для ≤ 7 значений (DESIGN §7.5.3).
- Валидация cardinality/enum ⊆ enum_values на уровне Schema.
- Автотесты UI (сейчас — только smoke чистой логики).

## Риски

- CSS-скрытие `.metadata-container` хрупко при обновлениях Obsidian
  (зафиксировано в ADR-006). Селектор актуален для 1.5–1.14.
- `workspace.on("file-open")` в редких случаях передаёт null — обработчик
  игнорирует параметр и перечитывает `getActiveFile()`.
- Typings `obsidian@1.14.4` требуют `minAppVersion` не ниже фактически
  используемых API; использованы API уровня 0.9.7–1.0 (совместимо с 1.5.0
  из manifest.json).
