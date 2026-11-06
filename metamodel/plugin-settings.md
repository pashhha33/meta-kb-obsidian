# Plugin settings & indexes

> Статус: draft (DESIGN-META)

## Настройки (`data.json` / Settings tab)

| Ключ | Тип | Default | Смысл |
|------|-----|---------|--------|
| `datetimeDisplay` | `local` \| `utc` \| `fixed-offset` | `local` | отображение created_at/updated_at |
| `datetimeOffset` | string | `+00:00` | если fixed-offset |
| `bootstrapOffer` | boolean | `true` | предлагать bootstrap |
| `suggestWrapImages` | boolean | `true` | hover «создать обёртку» |
| `authorSheetChars` | number | `40000` | знаков в авторском листе |
| `strictValidation` | boolean | `false` | error блокирует save (иначе только статус) |
 `hideCoreProperties` | boolean | `true` | скрыть встроенные Properties |
| `propertiesWidgetLocation` | `sidebar` | `sidebar` | v1 only sidebar |
## Индекс: attachment → image

Назначение: C-IMG-05 (одна обёртка на файл).

| Операция | Поведение |
|----------|-----------|
| Создание `image` | зарегистрировать `attachment` → `id` обёртки |
| Смена `attachment` | обновить индекс; конфликт → error `image-attachment-unique` |
| Удаление `image` | снять запись; файл по C-IMG-07 |
| Lookup при hover/embed | O(1) по нормализованному пути |

Нормализация пути: относительно vault, unified separators, decode %.

## Прочее (задел)

- Индекс `book → chapters[]` по `chapter-of` + sort `position` (для навигации и char-count).  
- Не персистить обязательно: можно перестраивать при load.

|