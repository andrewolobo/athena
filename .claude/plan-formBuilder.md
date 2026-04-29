You can prompt right now — there's no cooldown on your end.

Let me explore what's already in place before proposing the strategy.

Now I have a complete picture. Let me lay out the strategy.

---

## Form Builder — Implementation Strategy

### What already exists

**Backend** (`forms.ts`) already has the entire XLSForm infrastructure:

- `exceljs` parsing: `survey` / `choices` / `settings` sheets → `xlsform_json` JSONB
- `xlsform_json` stored in `form_versions` and served via `GET /forms/:id/definition`
- Breaking-change detection between versions
- `parseXlsForm()` validates required columns on upload

The `xlsform_json` shape the whole API is built around is:

```typescript
{
  survey:   Array<Record<string, string | number | boolean | null>>,
  choices:  Array<Record<string, string | number | boolean | null>>,
  settings: Array<Record<string, string | number | boolean | null>>
}
```

**Frontend** (`apps/web`) already has:

- A `survey-creation` mockup with the Analytical Sanctuary design applied
- `apps/web/src/routes/dashboard/forms/` already routed in the dashboard

---

### The core gap

`POST /forms` and `POST /forms/:id/versions` currently accept **only xlsx file uploads**. The form builder needs to submit `xlsform_json` directly as JSON — no round-trip through Excel. The backend needs a second intake path.

---

### Strategy

#### 1. Backend: Add a JSON intake path (minimal change)

Extract the structural validation that currently lives inside `parseXlsForm()` into a standalone `validateXlsFormJson()` function. Then add a parallel JSON body route:

```
POST /forms                          # existing: multipart/form-data + .xlsx
POST /forms/from-json                # new: application/json { folder_schema, form_key, display_name, xlsform_json }

POST /forms/:id/versions             # existing: multipart/form-data + .xlsx
POST /forms/:id/versions/from-json   # new: application/json { xlsform_json }
```

The new routes run `validateXlsFormJson()`, do the same breaking-change check, and write to `form_versions` exactly as the upload path does. The rest of the system (DQA, ingestion, reporting) remains untouched.

Also add:

```
GET /forms/:id/export               # Returns .xlsx generated server-side via exceljs
```

This lets the builder round-trip: build visually → save as xlsform_json → download as xlsx for field teams using ODK Collect directly.

#### 2. Frontend data model

The builder maintains a typed `BuilderState` that maps 1:1 onto the xlsform_json schema:

```typescript
// src/lib/stores/formBuilder.ts

interface BuilderQuestion {
  _id: string; // ephemeral drag-key, not serialised
  type: string; // 'text' | 'integer' | 'select_one my_list' | 'begin_group' etc.
  name: string;
  label: string;
  hint?: string;
  required?: "yes" | "no";
  constraint?: string;
  constraint_message?: string;
  relevant?: string;
  default?: string;
  calculation?: string; // for calculate type
  readonly?: "yes" | "no";
  appearance?: string;
}

interface BuilderChoice {
  _id: string;
  list_name: string;
  name: string;
  label: string;
}

interface BuilderState {
  form_title: string;
  questions: BuilderQuestion[];
  choices: BuilderChoice[];
}
```

Two utility functions in `src/lib/utils/xlsform.ts`:

- `serialize(state: BuilderState): XlsFormJson` — for submission to the API
- `deserialize(json: XlsFormJson): BuilderState` — for loading existing forms into the editor

#### 3. Frontend component tree

```
src/lib/components/form-builder/
  FormBuilder.svelte          ← root: two-panel layout (list | editor)
  QuestionList.svelte         ← sortable question cards, section headings
  QuestionCard.svelte         ← compact card per question (type chip + name + label)
  AddQuestionMenu.svelte      ← dropdown grouped by category
  editors/
    BaseEditor.svelte         ← name, label, hint, required, relevant, constraint
    SelectEditor.svelte       ← choice list picker + inline choice manager
    GroupEditor.svelte        ← label, relevant only (name auto-generated)
    CalculateEditor.svelte    ← calculation expression input
  ChoiceListManager.svelte    ← global panel: add/edit/delete choice lists
  FormSettings.svelte         ← form_title, form_id (locks after first save)
  BuilderPreview.svelte       ← read-only render of the form questions (Phase 2)
```

**Drag and drop:** Use the SvelteKit-native `@neodrag/svelte` (or CSS drag events) — no heavy library needed for a list reorder.

#### 4. XLSForm question types to support at launch

| Category  | Types                                                  |
| --------- | ------------------------------------------------------ |
| Text      | `text`, `note`                                         |
| Numbers   | `integer`, `decimal`                                   |
| Date/time | `date`, `datetime`, `time`                             |
| Choices   | `select_one`, `select_multiple`                        |
| Location  | `geopoint`                                             |
| Media     | `image`, `audio`                                       |
| Structure | `begin_group`/`end_group`, `begin_repeat`/`end_repeat` |
| Hidden    | `calculate`, `hidden`                                  |

`geoshape`, `geotrace`, `video`, `barcode`, `range` can be added post-Alpha.

#### 5. Validation strategy

Three tiers:

1. **Field-level** (live, client-side): `name` must match `^[a-zA-Z_][a-zA-Z0-9_]*$`; required fields non-empty; choice list referenced by select question must exist
2. **Form-level** (on save, client-side): no duplicate `name` values; select questions have at least one choice; `begin_group` has a matching `end_group`
3. **Server-side** (`validateXlsFormJson`): same checks as current `parseXlsForm` structural validation — acts as the authoritative gate before DB write

#### 6. Phased delivery

| Phase | Scope                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | JSON API endpoints + `validateXlsFormJson` extraction; builder store + serialize/deserialize utils; `QuestionList` + `BaseEditor`; text/integer/decimal/date/select types; `FormSettings`; save to API |
| **B** | Group/repeat support; `ChoiceListManager`; `AddQuestionMenu` with categories; constraint/relevant expression inputs; load existing form for editing (`deserialize`)                                    |
| **C** | `BuilderPreview` (read-only render); `GET /forms/:id/export` xlsx download; XLSForm xlsx import into builder (populate from uploaded file)                                                             |

Phase A alone gives a working form builder that integrates with the existing pipeline end-to-end. Phases B and C are feature completions, not prerequisites.

---

### One key constraint to flag

The breaking-change detection in `forms.ts:398–421` compares field names between versions. When the builder edits an existing form, it must warn the user client-side before they rename or delete a question that already has submission data — otherwise the save will 422 from the server with `removed_fields`. The `deserialize` utility should lock the `name` field on questions that were present in the previous version.

Let me read the existing web app structure before writing any code.

Starting with the backend, then frontend utilities, then components, then routes — all in batched parallel writes where possible.

**Backend: add `validateXlsFormJson` + two new routes to `forms.ts`**

Now insert `POST /from-json` after the xlsx upload route's closing and before `GET /:id`:

Now add `POST /:id/versions/from-json` before `DELETE /:id`:

Now write all the frontend files in parallel batches:

Now write all five components in parallel:

Now write the SvelteKit route files:

Now update the forms list page to add the "Build form" entry point:

Now verify the backend changes are correct by spot-checking the forms.ts file at the key insertion points:

All three backend additions are in place. Let me do a final check on the forms list page to make sure the edit landed cleanly:

Everything is clean. Let me give a summary of what Phase A delivered and what Phase B needs.

---

## Phase A — Complete

### What was built

**Backend (`apps/api/src/routes/forms.ts`)**

- `validateXlsFormJson()` — validates an already-parsed xlsform_json object (same structural checks as `parseXlsForm`, without touching xlsx)
- `POST /forms/from-json` — creates a new form from JSON body; identical transaction and uniqueness logic as the xlsx upload route
- `POST /forms/:id/versions/from-json` — publishes a new version from JSON; runs the same breaking-change detection

**Frontend utilities**

- [`src/lib/utils/xlsform.ts`](apps/web/src/lib/utils/xlsform.ts) — all XLSForm types, `makeQuestion`, `serialize`, `deserialize`, `validate`, `typeColorClass`
- [`src/lib/stores/formBuilder.ts`](apps/web/src/lib/stores/formBuilder.ts) — writable store with full CRUD for questions and choice lists; `formErrors` and `isFormValid` derived stores

**Components (`src/lib/components/form-builder/`)**

- `FormBuilder.svelte` — two-panel layout with toolbar (breadcrumb, Settings toggle, Save button)
- `QuestionList.svelte` — scrollable list with HTML5 drag-to-reorder
- `QuestionCard.svelte` — compact card with type chip, label, drag handle, delete button
- `AddQuestionMenu.svelte` — categorised dropdown for all 17 question types
- `FormSettings.svelte` — form title/key/sector fields with auto-slug generation
- `QuestionEditor.svelte` — unified editor covering name, label, hint, required toggle, choice list manager, relevant, constraint for all Phase A types

**Routes**

- `dashboard/forms/new/+page.svelte` — wraps the builder in a SvelteKit form for progressive enhancement; resets store on mount
- `dashboard/forms/new/+page.server.ts` — `save` action; POSTs to `/forms/from-json` and redirects to forms list on success
- `dashboard/forms/+page.svelte` — "Build Form" primary button added alongside the upload label

---

### What Phase B needs from you

**1. Confirm it runs** — run `npm run dev` in `apps/web` and `apps/api`. Check that:

- `/dashboard/forms` shows the "Build Form" button
- Navigating to `/dashboard/forms/new` renders the two-panel builder
- Creating a minimal form (title, key, sector, one text question) and saving redirects back to the list

**2. Three decisions before Phase B starts:**

| Decision                                                                        | Options                                                                                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edit existing forms** — load a saved form into the builder                    | (a) Add an "Edit" link on the forms list that hits `GET /forms/:id` and populates the store via a new `+page.server.ts` load function, or (b) defer to Phase C |
| **Sector / folder_schema input** — the free-text input works but is error-prone | (a) Keep free-text, (b) change to a `<select>` pre-populated from the forms list's existing `folder_schema` values                                             |
| **Group/repeat depth indicator** — begin_group/end_group pairing                | (a) Visual indentation in the question list to show nested depth, (b) flat list with just the type label (current)                                             |

**Phase B scope** (once you confirm Phase A is running):

- Group/repeat depth indentation in `QuestionList`
- `begin_group`/`end_group`/`begin_repeat`/`end_repeat` auto-paired (adding a Group Start automatically queues a Group End at the same position + 1)
- Edit mode: load existing `xlsform_json` into the builder for version updates
- `GET /forms/:id/export` — server-side xlsx generation via exceljs
