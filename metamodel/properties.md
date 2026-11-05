# Properties

> Статус: draft (DESIGN-META)  
> Источник: REFERENCE §7, §12 + ADR-004, ADR-005 + расширения DISCOVERY  
> Связано: `ontology.md`, `types.md`, `constraints.md`, `relations.md`

Свойство — объект `type: property` (слой `system`).  
Значение экземпляра хранится в frontmatter под `property_key`.

---

## 1. Правила определений свойства

| Ключ определения | Обязательность | Смысл |
|------------------|----------------|--------|
| `property_key` | always | уникален; неизменяем после `accepted` |
| `value_type` | always | один из 14 (см. `types.md`) |
| `required` | always | `always` \| `conditional` \| `never` (в ядре чаще conditional) |
| `applies_to` | always | список `type_value` или `*` |
| `enum_values` | conditional | для `enum` / `list<enum>` |

- `label` = `title`; `aliases[1]` = `property_key` (INV-16, INV-22).
- Область наследуется по `extends` типов (`source` покрывает потомков).
- `deprecated` не освобождает `id` и `property_key`.

---

## 2. Встроенные (универсальные) свойства

Обязательны у **любого** объекта.  
`owner` **исключён** (ADR-005).

| `property_key` | Label | value_type | required | Примечание |
|----------------|-------|------------|----------|------------|
| `id` | Идентификатор | `uuid` | always | UUIDv7; неизменяем |
| `type` | Тип | `string` | always | kebab-case |
| `defined_by` | Определён типом | `uuid` | always | сырой UUID определения |
| `title` | Название | `string` | always | непустой |
| `aliases` | Альтернативные имена | `list<string>` | always | `aliases[0] = title` |
| `layer` | Слой | `enum` | always | `system` \| `classification` \| `content` |
| `status` | Статус | `enum` | always | `draft` \| `accepted` \| `deprecated` |
| `created_at` | Создано | `datetime` | always | UTC; неизменяемо (ADR-004) |
| `updated_at` | Изменено | `datetime` | always | UTC; автообновление (ADR-004) |

Служебный ключ определений типа (не у каждого объекта):

| `property_key` | Label | value_type | applies_to | Примечание |
|----------------|-------|------------|------------|------------|
| `type_value` | Значение типа | `string` | `type` | равен `type` экземпляров |

---

## 3. Свойства ядра (Reference + расширения)

`required` по умолчанию — **conditional** (нет ключа = пусто), кроме отмеченных.

### 3.1. Медиа и вложения

| Ключ | Label | value_type | applies_to | Назначение |
|------|-------|------------|------------|------------|
| `cover` | Обложка | `media` | `source`, `album`, `film-series` | обложка |
| `poster` | Постер | `media` | `film`, `video`, `film-series` | афиша |
| `photo` | Фотография | `media` | `person`, `place`, `organization` | портрет / вид |
| `artwork` | Иллюстрации | `list<media>` | `note`, `source`, `event`, `place` | подборка |
| `attachment` | Вложение | `string` | `file`, `source`, `note`, `image` | путь; **always** для `image` (INV-24) |
| `roles` | Роли изображения | `list<enum>` | `image` | см. enum ниже (ADR-003) |

**`roles` enum:**  
`cover`, `poster`, `logo`, `illustration`, `art`, `photo`, `icon`, `thumbnail`

### 3.2. Идентификаторы и даты

| Ключ | Label | value_type | applies_to | Назначение |
|------|-------|------------|------------|------------|
| `url` | URL | `string` | `source`, `organization`, `place`, `project`, `event` | внешний адрес |
| `isbn` | ISBN | `string` | `book` | идентификатор издания |
| `published` | Дата публикации | `date` | `source`, `album` | дата выхода |
| `year` | Год | `number` | `source`, `album`, `film-series` | если точная дата неизвестна |
| `date` | Дата | `date` | `event`, `decision` | дата события / решения |
| `due` | Срок | `date` | `task`, `project`, `goal` | плановая дата |
| `completed` | Выполнено | `date` | `task`, `project`, `goal` | факт; нет ключа = не завершено |

### 3.3. Размер, порядок, страница

| Ключ | Label | value_type | applies_to | Назначение |
|------|-------|------------|------------|------------|
| `duration` | Длительность | `number` | `film`, `video`, `track`, `chapter`, `event`, `book` | минуты |
| `position` | Позиция | `number` | `chapter`, `film`, `track`, `image` | с 1; дыры допустимы (C-CH) |
| `page` | Страница | `string` | `quote`, `chapter`, `note` | страница / диапазон / таймкод |
| `page-count` | Объём в страницах | `number` | `book`, `chapter` | не путать с `page` |
| `char-count` | Знаки | `number` | `chapter`, `book` | **вычисляемое**; чистый текст (ADR-004) |
| `author-sheets` | Авторские листы | `number` | `book` | **вычисляемое**; char-count/40000 |

### 3.4. Фильм — сборы

| Ключ | Label | value_type | applies_to | Назначение |
|------|-------|------------|------------|------------|
| `box-office-domestic` | Внутренние сборы | `number` | `film` | домашний рынок |
| `box-office-worldwide` | Мировые сборы | `number` | `film` | мировые сборы |

Валюта в значении не кодируется (соглашение пользователя, обычно USD).

### 3.5. Персона и триггеры

| Ключ | Label | value_type | applies_to | Назначение |
|------|-------|------------|------------|------------|
| `occupation` | Профессия | `list<enum>` | `person` | **триггер** field-expansion |
| `specialization` | Специализация | `list<string>` | `person` | уточнение; может добавляться правилом |
| `format` | Формат издания | `enum` | `book` | **триггер**: `ebook`, `paper`, `audiobook` |
| `creation-method` | Способ создания | `enum` | `image` | **триггер**: `ai-generated`, `photograph`, `scan`, `illustration` |
| `model` | Модель | `string` | `image` | модель генерации |
| `prompt` | Запрос | `text` | `image` | текст запроса |
| `seed` | Сид | `number` | `image` | сид генерации |

**`occupation` enum** (расширенный):

```
developer, designer, researcher, teacher, writer, manager,
actor, director, producer, screenwriter, composer, musician,
singer, photographer, artist, animator, journalist, host,
voice-actor, politician, ruler, military, scientist, philosopher,
religious-figure, explorer, entrepreneur, athlete, activist
```

**Field-expansion (v1, как Reference):**

| Триггер | Значения | Добавляет |
|---------|----------|-----------|
| `occupation` | developer, designer, researcher, teacher, writer | `specialization` |
| `occupation` | developer, researcher, teacher, manager | отношение `member-of` |
| `format` | paper | `page-count` |
| `format` | ebook / audiobook | по Reference (attachment и др.) |
| `creation-method` | ai-generated | `model`, `prompt`, `seed` |

Новые профессии в `trigger_values` старых правил **пока не входят**.  
Смена триггера не удаляет данные (INV-27).

---

## 4. Вычисляемые свойства (плагин)

Пользователь **не** редактирует вручную:

| Ключ | Где | Когда пересчитывается |
|------|-----|------------------------|
| `created_at` | все | только при создании |
| `updated_at` | все | при значимом изменении |
| `char-count` | chapter | при сохранении тела |
| `char-count`, `author-sheets` | book | при изменении глав (C-CH-10) |

---

## 5. Чего нет в свойствах (намеренно)

- Связи с людьми и объектами — **отношения** (`author`, `director`, `actor`, `chapter-of`…), не свойства.
- `owner` — исключён (ADR-005).
- Валюта сборов, язык, страна — не введены; при необходимости отдельный ADR.

---

## 6. Границы v1

**Входит:** универсальные 9 свойств; ядро Reference; roles; box-office; char-count / author-sheets; расширенный occupation.

**Отложено:** фиксированные `id` определений свойств; полный каталог field-expansion как объекты; свойства system-only для automation/validation.