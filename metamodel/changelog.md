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