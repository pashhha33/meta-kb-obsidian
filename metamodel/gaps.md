# Пробелы метамодели (gaps)

> Статус: живой список  
> Фаза: DESIGN-META · ITER-2026-11-05-0  
> Назначение: явный реестр того, чего ещё нет или что отложено, чтобы не потерять перед DESIGN-PLUGIN / IMPL.

---

## 1. Документы, которых ещё нет

| Файл / тема | Зачем | Приоритет |
|-------------|--------|-----------|
| `validation.md` | реестр validation-rule, severity, связь с INV | высокий |
| Bootstrap vault | порядок создания 10 метатипов + опциональное ядро | высокий |
| Plugin settings schema | `datetimeDisplay`, пути, флаги UX | средний |
| Mapping frontmatter ↔ UI | формы по эффективному набору полей | средний |
| Миграции | rename category, owner removal, schema bumps | средний |

---

## 2. Открытые вопросы из Reference (перенос)

| ID | Суть | Решение у нас |
|----|------|----------------|
| Q-003 | переопределение унаследованных полей на уровне типа | отложено |
| Q-007 | роли book + format/audiobook без жёсткого правила | отложено |
| Q-008 | триггер field-expansion по фасету | **не в v1** |
| Q-004 | рост спецификации field-expansion | частично закрыто `field-expansion.md` |
| automation | метатип пустой | **не в v1** |
| язык `condition` у validation-rule | текст vs DSL | не решён → IMPL/ADR |

---

## 3. Пробелы по слоям модели

### System
- Нет каталога объектов `validation-rule` с `rule_key` (кроме отсылок в INV).
- `automation`: нет ключей и поведения.
- Нет фиксированных `id` для определений properties/relations ядра (в Reference часть была фиксирована — у нас пока «при bootstrap»).

### Classification
- Нет эталонных доменов/категорий/фасетов (только механизм).
- Нет UX дерева `category` и выбора facet-value.

### Content
- Нет полного набора свойств для всех 29 типов (есть person, film, chapter, image, book volume).
- `country` как тип отсутствует → `citizenship` пока `list<string>`.
- Relation `founded` (entrepreneur → organization) не введён.
- FE для `format: ebook|audiobook` (attachment, duration) не формализованы (Q-007).

### Поведения плагина
- Нормализация `[[title]]` при уже существующей цели — алгоритм поиска дублей по title/aliases намечен, не специфицирован до конца.
- Индекс `attachment → image` (одна обёртка на файл) — требование есть, структура индекса нет.
- Парсер «тело → чистый текст» для `char-count` — не выбран алгоритм.
- Bases: контракт колонок image vs metadata — на уровне views, без API-схемы.

---

## 4. Расхождения с Reference (принятые)

| Тема | Reference | Мы | Где |
|------|-----------|-----|-----|
| owner | обязателен INV-11 | исключён | ADR-005 |
| hierarchical-category | имя метатипа | `category` | ADR-001 |
| обязательные поля | 8 | 9 (+ timestamps, − owner) | ADR-004/005 |
| chapter / image UX | базовый | расширенный | ADR-002/003 |
| occupation enum | 6 значений | расширенный + FE-01…06 | properties, field-expansion |

---

## 5. Рекомендуемый порядок закрытия

1. `validation.md` — встроенные правила (`link-target-exists`, `defined-by-consistent`, unique position в книге, image-has-attachment…).  
2. Bootstrap — минимальный набор заметок system.  
3. FE ebook/audiobook (если нужны в v1).  
4. Plugin settings + индекс image.  
5. Остальное — EVOLVE.

---

## 6. Что уже достаточно для DESIGN-PLUGIN

- ontology, types, relations, properties, field-expansion, constraints (INV + C-*), views (chapter, image)  
- ADR-001…005  

Плагин можно проектировать на этом каркасе; пробелы §1–3 закрывать параллельно или в IMPL-META.