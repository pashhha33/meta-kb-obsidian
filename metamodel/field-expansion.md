# Field expansion (развёртывание полей)

> Статус: draft (DESIGN-META)  
> Источник: REFERENCE §13 + расширения person/film/image  
> Связано: `properties.md`, `types.md`, `constraints.md` (INV-25…27)

Правило — объект `type: field-expansion` (слой `system`).  
Код плагина при добавлении правила не меняется: читаются объекты-правила.

---

## 1. Ключи определения правила

| Ключ | Тип | Обязательность | Смысл |
|------|-----|----------------|--------|
| `applies_to_type` | `list<string>` | always | `type_value`; действует и на потомков по `extends` |
| `trigger_property` | `string` | always | `property_key` с `enum` / `list<enum>` |
| `trigger_values` | `list<string>` | always | подмножество enum; срабатывает при любом пересечении |
| `adds_properties` | `list<string>` | хотя бы один из adds_* | `property_key` |
| `adds_relations` | `list<string>` | хотя бы один из adds_* | `relation_key` |
| `mode` | `enum` | always | в v1 только `union` |

- Ссылки на определения — по **ключам**, не по `id`.
- Все упомянутые ключи должны существовать.
- Правило не переопределяет `value_type`, `required`, `cardinality`, `applies_to`.
- В `draft` / `deprecated` не применяется.

---

## 2. Когда правило активно

`status: accepted`  
**и** тип объекта (или предок) ∈ `applies_to_type`  
**и** значение триггера пересекается с `trigger_values`  
(`enum` — вхождение; `list<enum>` — непустое пересечение; регистр значим).

Нет значения триггера → правило неактивно.

---

## 3. Эффективный набор полей (INV-26)

1. Набор типа по цепочке `extends` + `excludes` (nearest wins).  
2. Активные `field-expansion` (`accepted`).  
3. Фильтр по типу и триггеру.  
4. Объединение `adds_*` с набором типа (`union`).  
5. Порядок: поля типа, затем добавленные (по `id` правил; внутри — свойства, потом отношения); `field_order` типа может переопределить.

`excludes` типа сильнее добавки правила.  
**INV-27:** смена/удаление триггера не удаляет значения в frontmatter.

Поля из `adds_*` допустимы и **без** активного правила (правило управляет формой, не допустимостью).

---

## 4. Реестр правил v1

### FE-01 — person: specialization + field-of-work

| Поле | Значение |
|------|----------|
| `applies_to_type` | `person` |
| `trigger_property` | `occupation` |
| `trigger_values` | `developer`, `designer`, `researcher`, `teacher`, `writer`, `scientist`, `philosopher`, `journalist`, `artist`, `composer` |
| `adds_properties` | `specialization`, `field-of-work` |
| `adds_relations` | — |
| `mode` | `union` |

### FE-02 — person: member-of

| Поле | Значение |
|------|----------|
| `applies_to_type` | `person` |
| `trigger_property` | `occupation` |
| `trigger_values` | `developer`, `researcher`, `teacher`, `manager`, `entrepreneur`, `athlete` |
| `adds_properties` | — |
| `adds_relations` | `member-of` |
| `mode` | `union` |

### FE-03 — person: office + party

| Поле | Значение |
|------|----------|
| `applies_to_type` | `person` |
| `trigger_property` | `occupation` |
| `trigger_values` | `politician`, `ruler` |
| `adds_properties` | `office`, `party` |
| `adds_relations` | — |
| `mode` | `union` |

### FE-04 — person: military-rank

| Поле | Значение |
|------|----------|
| `applies_to_type` | `person` |
| `trigger_property` | `occupation` |
| `trigger_values` | `military` |
| `adds_properties` | `military-rank` |
| `adds_relations` | — |
| `mode` | `union` |

### FE-05 — person: sport (+ member-of уже в FE-02 для athlete)

| Поле | Значение |
|------|----------|
| `applies_to_type` | `person` |
| `trigger_property` | `occupation` |
| `trigger_values` | `athlete` |
| `adds_properties` | `sport` |
| `adds_relations` | — |
| `mode` | `union` |

### FE-06 — person: instrument + genre

| Поле | Значение |
|------|----------|
| `applies_to_type` | `person` |
| `trigger_property` | `occupation` |
| `trigger_values` | `musician`, `singer`, `composer` |
| `adds_properties` | `instrument`, `genre` |
| `adds_relations` | — |
| `mode` | `union` |

### FE-07 — book: format → page-count

| Поле | Значение |
|------|----------|
| `applies_to_type` | `book` |
| `trigger_property` | `format` |
| `trigger_values` | `paper` |
| `adds_properties` | `page-count` |
| `adds_relations` | — |
| `mode` | `union` |

### FE-08 — image: creation-method → AI fields

| Поле | Значение |
|------|----------|
| `applies_to_type` | `image` |
| `trigger_property` | `creation-method` |
| `trigger_values` | `ai-generated` |
| `adds_properties` | `model`, `prompt`, `seed` |
| `adds_relations` | — |
| `mode` | `union` |

> Актёр / режиссёр и т.п.: отдельных FE нет — работы через отношения на `film`/`video`.

### FE-09 — book: format ebook

| Поле | Значение |
|------|----------|
| `applies_to_type` | `book` |
| `trigger_property` | `format` |
| `trigger_values` | `ebook` |
| `adds_properties` | `attachment`, `url` |
| `mode` | `union` |

### FE-10 — book: format audiobook

| Поле | Значение |
|------|----------|
| `applies_to_type` | `book` |
| `trigger_property` | `format` |
| `trigger_values` | `audiobook` |
| `adds_properties` | `attachment`, `duration` |
| `mode` | `union` |

> Жёсткое правило «audiobook без attachment/duration = error» в v1 **не** вводим (Q-007); только развёртывание формы.

---

## 5. Триггерные свойства (сводка)

| property_key | Тип | applies_to | enum (кратко) |
|--------------|-----|------------|---------------|
| `occupation` | `list<enum>` | `person` | см. `properties.md` |
| `format` | `enum` | `book` | `ebook`, `paper`, `audiobook` |
| `creation-method` | `enum` | `image` | `ai-generated`, `photograph`, `scan`, `illustration` |

Триггер по **фасету** в v1 не поддерживается (Q-008).

---

## 6. Границы v1

**Входит:** FE-01…FE-08, mode `union`, INV-25…27.  

**Отложено:** `first-match` / `override`; триггер по facet; FE для audiobook/ebook attachment; формальный DSL условий.