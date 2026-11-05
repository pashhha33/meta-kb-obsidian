# Bootstrap vault

> Статус: draft (DESIGN-META)

Минимальный набор, без которого плагин не считает vault инициализированным.

## Обязательно (system)

1. Создать **10 метатипов** с фиксированными `id` из `types.md` (`type: type`, `status: accepted`, `layer: system`).
2. Метатип `type` (№1): `defined_by` = собственный `id`.
3. Остальные метатипы: `defined_by` = id метатипа `type`.
4. Имена файлов: `{type_prefix}_{id}.md`.

## Опционально (ядро content)

По выбору владельца — определения `type` для нужных из 29 типов ядра **без** фиксированных id.  
Рекомендуемый минимум для chapter/image UX:  
`source`, `book`, `chapter`, `file`, `image`, `person`.

## Опционально (definitions)

- Объекты `property` / `relation` / `field-expansion` / `validation-rule` по реестрам metamodel.  
- Можно отложить: плагин может держать встроенные rule_key до появления заметок.

## Порядок

1. Метатипы.  
2. (Опц.) property / relation / FE / validation-rule.  
3. (Опц.) типы ядра content.  
4. Пользовательские объекты.

## Признак «vault bootstrapped»

Существуют все 10 файлов метатипов с ожидаемыми `id`.  
Иначе плагин предлагает мастер bootstrap.