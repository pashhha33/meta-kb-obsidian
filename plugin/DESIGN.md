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

#### 7.5.1. Модалки link / media

##### 1. Общий каркас модалки поля

```
Заголовок: Label поля
Подзаголовок: property_key · value_type · cardinality

[ область ввода — зависит от типа ]

[ Очистить ]              [ Отмена ]  [ OK ]
```

- **OK** — валидация → запись канонической ссылки (или списка) в frontmatter.  
- **Очистить** — удалить ключ (пустое = отсутствие ключа).  
- Для `1..1` / `1..*` кнопка «Очистить» disabled или показывает ошибку, если значение станет пустым.

Запись в frontmatter **только** канонической формой:

```text
[[{type_prefix}_{id}|{title}]]
```

---

##### 2. Модалка `link` (0..1 / 1..1)

###### 2.1. Фильтр целей

Берётся из определения отношения или свойства:

| Источник ограничения | Пример |
|----------------------|--------|
| `relation.target_type` | `chapter-of` → только `book` |
| `value_type: link` + applies / convention | `birth-place` → `place` |
| `*` | любой объект `layer: content` |

Список кандидатов = Registry.filter(types ∈ target_type, status ≠ запрещённый для выбора; по умолчанию `deprecated` скрыты, toggle «Показать deprecated»).

###### 2.2. UI

```
Поиск: [________________] 🔍

Текущее:  Книга «Имя»   [×]

Результаты (virtual list):
  ○ book_01a1…  Война и мир
  ○ book_01a2…  Анна Каренина
  …
```

| Элемент | Поведение |
|---------|-----------|
| Поиск | substring по `title`, `aliases`, опционально по `id`/`type_prefix` |
| Текущее | если значение уже есть — chip с title; × = сброс в модалке |
| Список | одиночный выбор (radio); подпись: `type` + title |
| Enter / double-click | выбрать и OK |
| Пустой поиск | top-N недавних / по алфавиту title |

###### 2.3. Создание «на лету»

Кнопка **«Создать…»** (если target_type один конкретный тип или пользователь выбрал тип):

1. Запрос `title` (и обязательные поля минимума, если есть).  
2. Создание объекта (как create-from-empty-link).  
3. Автовыбор новой цели в модалке.

Для `media` — **не** создавать через эту кнопку (см. §3).

###### 2.4. Валидация при OK

- Цель существует в Registry.  
- `type` цели ∈ допустимых.  
- Форма значения — одна ссылка, не массив (`0..1`/`1..1`).

---

##### 3. Модалка `list<link>` (0..\* / 1..\*)

```
Поиск: [________________]

Выбрано (chips):
  [Война и мир ×] [Анна Каренина ×]

Результаты:
  ☐ book_…  …
  ☑ book_…  …
```

| Отличие от single | |
|-------------------|--|
| Multi-select | checkbox |
| Порядок | сохранять порядок выбора; опционально drag chips |
| 1..\* | OK запрещён при нуле выбранных |
| Дубликаты | один id один раз |

Запись: YAML-список канонических строк.

---

##### 4. Модалка `media` (→ только `image`)

INV-23: значение — ссылка на обёртку `image`, не путь к файлу.

###### 4.1. Источники выбора (табы / сегменты)

| Источник | UI | Результат |
|----------|-----|-----------|
| **Обёртки** | suggest по Registry `type: image` + **миниатюра** (`attachment`) | каноническая ссылка на image |
| **Необёрнутые файлы** | grid миниатюр файлов vault без записи в индексе attachment→image | после выбора: создать image (C-IMG-04) или предложить существующую при конфликте |
| **Буфер / путь** | как C-IMG-04 | создать обёртку → подставить ссылку |

Для свойства `media` **не** предлагать create-from-empty-link с типом note — только image flow.

###### 4.2. UI (вкладка «Обёртки»)

```
Поиск: [________]

[thumb] title     roles: cover, poster
[thumb] title     …
```

Клики: одиночный выбор. Превью из `attachment` (Obsidian resource path).

###### 4.3. UI (вкладка «Файлы без обёртки»)

Grid миниатюр (не текстовый список) — как в C-IMG-04.  
Выбор → модалка имени обёртки (default = имя файла) → создание `image` → значение поля = ссылка на неё.

###### 4.4. Валидация

- Цель `type: image`.  
- У цели есть `attachment` (иначе warning/error по `image-has-attachment`).  
- Индекс: не создавать вторую обёртку на тот же путь.

---

##### 5. Модалка `list<media>`

Как `list<link>`, но:

- кандидаты только `image`;
- chips с **миниатюрами**;
- те же вкладки «Обёртки» / «Необёрнутые» / «Импорт»;
- запись — список канонических ссылок на image.

Используется для `artwork` и подобных.

---

##### 6. Отображение value summary в строке виджета

| value_type | Summary |
|------------|---------|
| `link` | `title` цели (клик → open note); если broken — key красным |
| `list<link>` | до 2 title + «+N» |
| `media` | миниатюра 24px + title обёртки |
| `list<media>` | ряд до 3 миниатюр + «+N» |

Broken link: `link-target-exists` → icon warning, summary = сырая строка.

---

##### 7. Связь с C-IMG / Indexes

| Событие в модалке | Индекс / правило |
|-------------------|------------------|
| Выбор необёрнутого файла | C-IMG-04; при существующей обёртке — только propose existing |
| Создание image | Indexes.attachment → id |
| Удаление значения media | объект image **не** удаляется (только очистка поля) |
| Удаление image из vault | поля media становятся broken → validation |

---

##### 8. Критерии приёмки (link/media)

1. `chapter-of`: в модалке только `book`; OK пишет `[[book_{id}\|Title]]`.  
2. `birth-place`: только `place`.  
3. `cover` (`media`): список image с thumbs; выбор файла без обёртки создаёт image и подставляет ссылку.  
4. Повторный выбор того же файла → не второй image, а существующая обёртка.  
5. `artwork` (`list<media>`): несколько image, summary с миниатюрами.  
6. Broken link в виджете помечен; модалка предлагает заменить.

### 7.5.2. Boolean

**В строке виджета:** toggle (без модалки).  
**Alt+click / кнопка ✎:** модалка с toggle + OK (для единообразия).

| Действие | Запись |
|----------|--------|
| ON | `true` |
| OFF | удалить ключ **или** `false` (настройка `booleanWriteFalse`, default: писать `false`) |

### 7.5.3. Enum (одиночный)

**В строке:**  
- если значений ≤ 7 — **cycle** по клику на value (как FileClass Cycle);  
- иначе — только ✎ → modal select.

**Модалка:** radio / dropdown по `enum_values` определения property.  
Пустое значение = удалить ключ (если не required).

### 7.5.4. list\<enum\>

Модалка: multi-checkbox по `enum_values`.  
Chips в summary. Порядок: порядок `enum_values`, не порядок кликов (стабильность).

Пример: `occupation`, `roles`.

### 7.5.5. string / text / number / date / datetime

| type | Modal |
|------|--------|
| `string` | input, одна строка |
| `text` | textarea |
| `number` | input[type=number]; пусто → удалить ключ |
| `date` | date picker → `YYYY-MM-DD` |
| `datetime` | datetime picker; **store UTC**; display per `datetimeDisplay` |

Read-only datetime (`created_at` / `updated_at`): только summary, без ✎.

### 7.5.6. uuid

Только read-only в виджете (`id`, `defined_by`). Редактирование через UI запрещено.


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

### 7.10. Группировка строк

1. **Системные** (свёрнуто по умолчанию): type, layer, status, id, defined_by, created_at, updated_at  
2. **Схема** — effective properties (без системных)  
3. **Отношения** — effective relations (author, chapter-of, …)  
4. **Вычисляемые** — char-count, author-sheets (read-only)

Подписи секций локализованы (RU в v1 UI strings).