# Plugin design (v1)

> Фаза: DESIGN-PLUGIN · ITER-2026-11-06-0  
> Опирается на: `metamodel/*` (baseline v1)

## 1. Цель плагина

Читать и поддерживать метамодель Second Brain PKB в vault Obsidian:

- объекты = заметки с frontmatter;
- канонические ссылки, validation, field-expansion;
- UX: chapter, image wrapper, bootstrap;
- timestamps, объём book/chapter.

## 2. Модули

| Модуль | Ответственность |
|--------|-----------------|
| **Bootstrap** | проверка 10 метатипов; мастер создания |
| **Loader** | сканирование vault → parse frontmatter → ObjectRecord |
| **Registry** | id → object; type_value → type def; индексы |
| **Indexes** | attachment→image; book→chapters; title/alias lookup |
| **Schema** | effective fields (extends + FE); type_prefix |
| **Links** | normalize wikilink; resolve target |
| **Validation** | rule_key engine; error/warning |
| **Commands** | create object, create chapter, wrap image, bootstrap |
| **UI** | forms, hover overlay, chapter nav, settings |
| **Derived** | created_at/updated_at, char-count, author-sheets |

## 3. Runtime ObjectRecord (эскиз)

```
id, type, defined_by, title, aliases, layer, status,
created_at, updated_at,
path, type_prefix,
props: Map<string, unknown>,   // frontmatter кроме системных
body: string,
effectiveFields: Field[],      // после FE
incoming: Link[]               // вычисляемые
```

## 4. Потоки

1. **On load / vault change** → Loader → Registry + Indexes → Validation (async batch).  
2. **Create object** → dialog type/title → write file → Registry update.  
3. **Chapter** → C-CH-01…11 (запросы book/position/title, nav, volume).  
4. **Image** → C-IMG (wrap, hover, embed shows attachment).  
5. **Save note** → update updated_at; if chapter → recompute book volume + updated_at.

## 5. Сценарии приёмки (черновик)

- Bootstrap создаёт 10 метатипов с фиксированными id.  
- Создание chapter без имени → `Глава - N`; книга суммирует char-count.  
- Два image с одним attachment → error.  
- occupation politician → в форме видны office, party.  
- Embed `![[image_…]]` показывает файл, не карточку.

## 6. Вне скоупа v1 плагина

automation execution; DSL condition; Bases advanced; полный CRUD всех relation UI.

## 7. Properties Widget (первый вертикальный срез)

### 7.1. Цель

Единственный UI свойств объекта в рабочей области заметки:

- подмена `property_key` / `relation_key` → **label** (`title` определения);
- редактирование через **модалки** по `value_type`;
- список полей = **effective fields** (тип + field-expansion);
- встроенная панель Properties Obsidian **скрыта**.

### 7.2. Отключение core Properties

| Механизм | Поведение |
|----------|-----------|
| CSS / workspace | скрыть `.metadata-container` (или актуальный селектор Properties) в note view |
| Настройка | `hideCoreProperties: true` (default **true**) |
| Fallback | при `false` — core виден; виджет плагина можно оставить сверху или выключить |

Плагин не пишет в «чужой» UI Properties; только собственный view.

### 7.3. Размещение виджета

**Вариант A (рекомендуемый для v1):**  
`ItemView` / leaf в **боковой панели** (right sidebar) — «Meta KB Properties», привязка к активному файлу.

**Вариант B:** embed под заголовком заметки (Markdown post-processor / header component) — сложнее с live preview.

v1: **A**; B — позже.

### 7.4. Строка поля

```
[icon value_type]  Label (RU)     [value summary]     [✎]
```

| Элемент | Правило |
|---------|---------|
| Label | `title` объекта `property`/`relation` с этим key; иначе key |
| Подпись key | опционально secondary text / tooltip = `property_key` |
| Value summary | человекочитаемо: даты по `datetimeDisplay`, link → title цели, list → «N значений» |
| Кнопка ✎ | открывает модалку поля |
| Boolean / enum single | опционально toggle/cycle **без** модалки (как FileClass); Alt+click → модалка |

Порядок строк: `field_order` типа + FE order (INV-26).

### 7.5. Модалки по value_type

| value_type | UI модалки |
|------------|------------|
| `string`, `text` | input / textarea |
| `number` | number input |
| `boolean` | toggle |
| `date` | date picker |
| `datetime` | datetime; store UTC, show per settings |
| `enum` | select |
| `list<string>`, `list<enum>` | multi-select / tag-like |
| `link`, `list<link>` | suggest из Registry (filter by target types) |
| `media`, `list<media>` | suggest только `image` + превью |
| `uuid` | read-only или warning (defined_by не из UI) |

Валидация в модалке: cardinality, enum ⊆ enum_values; по OK → `processFrontMatter` + Registry + `updated_at`.

### 7.6. Служебные / вычисляемые поля

`id`, `created_at`, `updated_at`, `char-count`, `author-sheets` — **read-only** в виджете (без ✎ или ✎ disabled).

`defined_by`, `type`, `layer` — read-only или отдельная «системная» секция.

### 7.7. Команды

- `Meta KB: Open properties widget`
- `Meta KB: Edit field…` (suggest field → modal)
- `Meta KB: Insert missing fields` (ключи effective, которых нет в frontmatter)

### 7.8. Зависимости runtime

Widget читает: Registry, Schema (effective fields), property/relation definitions (labels), Indexes (resolve links).

Минимальный IMPL-порядок для среза:

1. Loader + Registry (хотя бы текущий файл)  
2. Schema effective fields  
3. Properties view + modal shell  
4. Hide core Properties  
5. Write path (frontmatter) + updated_at  

### 7.9. Критерии приёмки

- В заметке `type: person` видны labels «Профессия», «Дата рождения», не сырые keys.  
- При `occupation: [politician]` появляются office, party (FE).  
- Кнопка у `birth-date` открывает date picker; значение пишется в frontmatter.  
- Core Properties panel не видна при default settings.  
- `char-count` у chapter отображается, не редактируется.