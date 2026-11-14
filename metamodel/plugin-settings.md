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
| `thumbnailSize` | number | `120` | сторона миниатюры галереи, 48–320 px |
| `thumbnailAspect` | `square` \| `native` \| `4:3` \| `16:9` | `square` | пропорции миниатюр галереи |
| `definitionsFolder` | string | `_meta` | папка определений метамодели (bootstrap) |
| `logLevel` | `silent` \| `error` \| `warn` \| `info` \| `debug` | `info` | подробность журнала плагина |
| `logToConsole` | boolean | `true` | дублировать журнал в консоль Obsidian |

**Логирование.** Уровень — это порог: `warn` пропускает `warn` и `error`, но
не `info`; `debug` пропускает всё. Записи хранятся в памяти (последние 500) и
показываются командой «Показать лог»; в консоль они попадают только при
включённом `logToConsole`. Файл журнала на диск не пишется: это личное
хранилище, и молча создавать в нём служебные файлы плагин не должен.

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