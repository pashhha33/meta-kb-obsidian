# Plugin design (v1)

> Фаза: DESIGN-PLUGIN · ITER-2026-11-06-0  
> Опирается на: `metamodel/*` (baseline v1)

## 1. Цель плагина

Читать и поддерживать метамодель Second Brain PKB в vault Obsidian:

- объекты = заметки с frontmatter;
- канонические ссылки, validation, field-expansion;
- UX: chapter, image wrapper, bootstrap;
- timestamps, объём book/chapter.

## 2. Модули

| Модуль | Ответственность |
|--------|-----------------|
| **Bootstrap** | проверка 10 метатипов; мастер создания |
| **Loader** | сканирование vault → parse frontmatter → ObjectRecord |
| **Registry** | id → object; type_value → type def; индексы |
| **Indexes** | attachment→image; book→chapters; title/alias lookup |
| **Schema** | effective fields (extends + FE); type_prefix |
| **Links** | normalize wikilink; resolve target |
| **Validation** | rule_key engine; error/warning |
| **Commands** | create object, create chapter, wrap image, bootstrap |
| **UI** | forms, hover overlay, chapter nav, settings |
| **Derived** | created_at/updated_at, char-count, author-sheets |

## 3. Runtime ObjectRecord (эскиз)

```
id, type, defined_by, title, aliases, layer, status,
created_at, updated_at,
path, type_prefix,
props: Map<string, unknown>,   // frontmatter кроме системных
body: string,
effectiveFields: Field[],      // после FE
incoming: Link[]               // вычисляемые
```

## 4. Потоки

1. **On load / vault change** → Loader → Registry + Indexes → Validation (async batch).  
2. **Create object** → dialog type/title → write file → Registry update.  
3. **Chapter** → C-CH-01…11 (запросы book/position/title, nav, volume).  
4. **Image** → C-IMG (wrap, hover, embed shows attachment).  
5. **Save note** → update updated_at; if chapter → recompute book volume + updated_at.

## 5. Сценарии приёмки (черновик)

- Bootstrap создаёт 10 метатипов с фиксированными id.  
- Создание chapter без имени → `Глава - N`; книга суммирует char-count.  
- Два image с одним attachment → error.  
- occupation politician → в форме видны office, party.  
- Embed `![[image_…]]` показывает файл, не карточку.

## 6. Вне скоупа v1 плагина

automation execution; DSL condition; Bases advanced; полный CRUD всех relation UI.