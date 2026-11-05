# Validation rules

> Статус: draft (DESIGN-META)  
> Источник: REFERENCE §14 + ADR / C-CH / C-IMG  
> Связано: `constraints.md` (INV), `gaps.md`

Правило — объект `type: validation-rule` (`layer: system`).  
В `draft` / `deprecated` не применяется.

## Ключи определения

| Ключ | Смысл |
|------|--------|
| `rule_key` | kebab-case, уникален |
| `checks` | ссылки на нормы (`INV-NN`, ADR, C-*) |
| `severity` | `error` \| `warning` |
| `applies_to` | `*` или список `type_value` |
| `condition` | текст условия (DSL в v1 нет) |
| `message` | текст для UI |

**error** — объект невалиден как источник определений / основа автоматизаций; данные не удаляются.  
**warning** — сохранение не блокируется, владелец уведомляется.

Схема (форма одного объекта) ≠ правило (имя файла, другие объекты, граф, вычисления).

## Реестр v1

### Error

| rule_key | Проверка | Норма | applies_to |
|----------|----------|-------|------------|
| `unique-id` | `id` уникален в vault | INV-02 | `*` |
| `filename-matches-object` | файл = `{type_prefix}_{id}.md` | INV-05,06 | `*` |
| `aliases-first-equals-title` | `aliases[0] = title` | INV-08 | `*` |
| `media-target-is-image` | цель `media` — `image` | INV-23 | `*` |
| `image-has-attachment` | у `image` есть `attachment` | INV-24, C-IMG | `image` |
| `image-attachment-unique` | один `attachment` → одна обёртка | C-IMG-05 | `image` |
| `extends-acyclic` | нет циклов `extends` | INV-18 | `type` |
| `defined-by-consistent` | `defined_by` → type def с тем же `type_value` в system | INV-12,13 | `*` |
| `trigger-values-subset` | `trigger_values` ⊆ enum триггера | INV-25 | `field-expansion` |
| `expansion-keys-exist` | ключи trigger/adds/applies существуют; триггер enum\|list\<enum\> | INV-25 | `field-expansion` |
| `link-target-exists` | цель канонической ссылки существует | INV-15 | `*` |
| `unique-machine-keys` | уникальны type_value, property_key, relation_key, rule_key | INV-13,16,17 | определения |
| `relation-acyclic` | ацикличны `parent`, `part-of`, `blocks` | relations | `*` |
| `relation-endpoints-match` | типы концов ∈ области отношения | INV-17 | `*` |
| `relation-cardinality-form` | форма значения ↔ cardinality | INV-17 | `*` |
| `facet-target-is-facet` | facet у facet-value — type facet | INV-15 | `facet-value` |
| `chapter-position-unique` | в одной книге `position` уникален | C-CH-05 | `chapter` |
| `chapter-of-required` | у chapter есть `chapter-of` 1..1 | C-CH-05 | `chapter` |

### Warning

| rule_key | Проверка | Норма | applies_to |
|----------|----------|-------|------------|
| `inactive-field-value` | значение поля без активного FE | INV-27 | `*` |
| `extends-depth` | `extends` глубже 5 | INV-18 | `type` |
| `deprecated-link-target` | ссылка на `deprecated` | INV-10 | `*` |
| `collection-element-consistent` | film→series, track→album, image→gallery | Reference DL-025 | `film`, `track`, `image` |
| `orphan-attachment` | файл без обёртки при политике «рекомендовать wrap» | C-IMG | `*` |

## Волна 2 (не v1)

Файл по `attachment` существует; alias = title цели; enum ∈ enum_values; category-domain согласован в ветке; format audiobook без attachment/duration (частично → FE ниже); requires_properties.