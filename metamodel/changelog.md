# Changelog метамодели

## [ITER-2026-11-14-14] — 2026-11-14 · schemaVersion 1.4.0 → 1.5.0
- Добавлено правило `enum-value-in-set`: значение enum-свойства обязано
  входить в `enum_values` из контракта. Пробел вскрылся при переводе G4 на
  настоящий валидатор: `tools/accept.mjs` проверял enum сам, а плагин — нет,
  поэтому неверное значение в frontmatter проходило молча.
- `checks: ["properties"]` — норма записана в `metamodel/properties.md`
  (список `enum_values` у свойства), отдельного INV для неё нет.
## [ITER-2026-11-14-9] — 2026-11-14 · schemaVersion 1.3.0 → 1.4.0
- Добавлены настройки `logLevel` (`silent` | `error` | `warn` | `info` |
  `debug`, default `info`) и `logToConsole` (boolean, default `true`).
- Журнал плагина: уровни-порог, кольцевой буфер последних 500 записей,
  команда «Показать лог». Файл на диск не пишется: служебные файлы в
  личном хранилище плагин не создаёт.
## [ITER-2026-11-14-3] — 2026-11-14 · schemaVersion 1.2.0 → 1.3.0
- Реализованы C-IMG-01 (embed обёртки показывает само изображение из
  `attachment`) и C-IMG-07 (удаление обёртки с обязательным вопросом, удалять ли
  привязанный файл).
- Добавлены настройки `thumbnailSize` (48–320 px, default 120) и
  `thumbnailAspect` (`square` | `native` | `4:3` | `16:9`, default `square`);
  вместе с ранее добавленной `definitionsFolder` список настроек в контракте
  синхронизирован с плагином (12 записей вместо 9).
- C-IMG-03 (hover-иконки над изображением) отложен: требует проверки в живой
  сессии Obsidian.

## [ITER-2026-11-14-2] — 2026-11-14 · schemaVersion 1.1.0 → 1.2.0
- **ADR-007:** у свойства появилось поле `required_by_type` — переопределение
  обязательности для конкретного типа. `attachment` получает
  `required_by_type: { "image": "always" }`, то есть INV-24 («`attachment`
  обязателен у `image`») стал машиночитаемым, а не только фразой в
  `properties.md` §3.1.
- Поиск обязательности идёт по цепочке `extends` (ближайший предок побеждает),
  при отсутствии переопределения действует `required` свойства —
  `requiredFor()` в `plugin/src/core/metamodel.ts`.
- G2: ключи `required_by_type` обязаны ссылаться на существующие типы, значения —
  входить в enum `always | conditional | never`.
- Реализация среза A1 по ADR-003 / C-IMG: создание обёртки с выбором файла,
  индекс `attachment → image`, запрет второй обёртки на тот же файл (C-IMG-05).

## [ITER-2026-11-14-1] — 2026-11-14 · schemaVersion 1.0.0 → 1.1.0
- **Исправление контракта:** у всех 10 метатипов `layer` приведён к `system`
  (types.md §1: «У всех: `type: type`, `layer: system`, `status: accepted»).
  Слой объектов, которые метатип определяет, вынесен в новое поле
  `defines_layer` (столбец «Определяет объекты слоя»). Ранее `domain`,
  `category`, `facet`, `facet-value` имели `layer: classification` — это
  смешивало слой самого определения со слоем его экземпляров.
- `types.md` §1: `title` определения = английское имя (`type_value`),
  `aliases[0] = title`, `aliases[1]` = русское имя.
- G2 (`tools/schema-check.mjs`): добавлена сверка значений — `layer` метатипа
  обязан быть `system`, `defines_layer` обязан совпадать со столбцом таблицы
  `types.md` §1; поддержан `--file <путь>`.
- `gaps.md` §1: пункт «Bootstrap vault» закрыт (10 метатипов + определения
  29 типов ядра создаются командой плагина).

## [Unreleased]
- Инициализация
- **ADR-001**: переименование встроенного метатипа `hierarchical-category` → `category`
- **ADR-002**: поведение создания и навигации для `chapter` (C-CH-01…C-CH-06)
- **ADR-003**: поведение обёртки `image` (C-IMG-01…C-IMG-07), роли `roles`
- **ADR-004**: обязательные `created_at` / `updated_at` (UTC + настройка отображения); объём главы (`char-count`) и книги (`char-count`, `author-sheets`)
- **ADR-005**: исключение `owner` из обязательных свойств
- `ontology.md`: первая версия онтологии (слои, 9 обязательных свойств, идентичность, `defined_by`)
- `types.md`: метатипы (10, category), value_types (14), ядро типов (29)
- `relations.md`: 4 отношения классификации + 14 ядра (`category` вместо hierarchical-category)
- свойства `film`: `box-office-domestic`, `box-office-worldwide`
- отношения ядра: `director`, `actor` (`film`/`video` → `person`)
- `person.occupation`: расширенный enum (IT + мультимедиа + исторические роли); field-expansion без изменений
- constraints: сводка INV-01…27 с пометками ADR-001/005 и отсылкой к C-CORE/C-CH/C-IMG
## [ITER-2026-11-04-1] — 2026-11-05
- DISCOVERY завершён
- ADR-001…005
- ontology, types, relations, constraints (INV + behaviors), views
- film: box-office; relations director/actor; person.occupation расширен
- `properties.md`: универсальные + ядро + roles, box-office, volume, occupation
- person: birth/death, citizenship; occupation-triggered props (office, party, military-rank, sport, instrument, genre, field-of-work)
- person: birth/death/place/citizenship; field-of-work; occupation-triggered
  office, party, military-rank, sport, instrument, genre
- `field-expansion.md`: реестр FE-01…08 (person/book/image)
- `gaps.md`: реестр пробелов и отложенных Q-* перед DESIGN-PLUGIN
- validation.md — реестр rule_key v1 + chapter/image
- bootstrap.md — 10 метатипов, опциональное ядро
- field-expansion: FE-09/10 (ebook, audiobook)
- plugin-settings.md — datetime, wrap, индексы attachment/book
- gaps §5 закрыт
## [ITER-2026-11-05-0] — DESIGN-META completed
## [Unreleased] — DESIGN-PLUGIN ITER-2026-11-06-0