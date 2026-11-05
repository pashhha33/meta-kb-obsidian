# Changelog метамодели

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