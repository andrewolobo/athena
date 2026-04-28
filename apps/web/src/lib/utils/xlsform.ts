// XLSForm type definitions, builder state model, and serialize/deserialize utilities.
// The xlsform_json shape here is the canonical format stored in form_versions.xlsform_json.

export type QuestionType =
  | "text"
  | "integer"
  | "decimal"
  | "date"
  | "datetime"
  | "time"
  | "select_one"
  | "select_multiple"
  | "image"
  | "audio"
  | "geopoint"
  | "begin_group"
  | "end_group"
  | "begin_repeat"
  | "end_repeat"
  | "note"
  | "calculate";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: "Text",
  integer: "Integer",
  decimal: "Decimal",
  date: "Date",
  datetime: "Date & Time",
  time: "Time",
  select_one: "Select One",
  select_multiple: "Select Multiple",
  image: "Photo",
  audio: "Audio",
  geopoint: "GPS Point",
  begin_group: "Group Start",
  end_group: "Group End",
  begin_repeat: "Repeat Start",
  end_repeat: "Repeat End",
  note: "Note",
  calculate: "Calculate",
};

export const QUESTION_CATEGORIES: { label: string; types: QuestionType[] }[] = [
  {
    label: "Basic",
    types: ["text", "integer", "decimal", "date", "datetime", "time", "note"],
  },
  {
    label: "Choice",
    types: ["select_one", "select_multiple"],
  },
  {
    label: "Media & Location",
    types: ["image", "audio", "geopoint"],
  },
  {
    label: "Structure",
    types: [
      "begin_group",
      "end_group",
      "begin_repeat",
      "end_repeat",
      "calculate",
    ],
  },
];

// Types where the row carries no name/label (structural markers only)
export const NO_NAME_TYPES = new Set<QuestionType>(["end_group", "end_repeat"]);
export const NO_LABEL_TYPES = new Set<QuestionType>([
  "end_group",
  "end_repeat",
]);
export const SELECT_TYPES = new Set<QuestionType>([
  "select_one",
  "select_multiple",
]);
export const STRUCTURE_TYPES = new Set<QuestionType>([
  "begin_group",
  "end_group",
  "begin_repeat",
  "end_repeat",
]);

// ── Builder state types ───────────────────────────────────

export interface BuilderQuestion {
  _id: string;
  type: QuestionType;
  name: string;
  label: string;
  hint: string;
  required: boolean;
  constraint: string;
  constraint_message: string;
  relevant: string;
  default_value: string;
  calculation: string;
  readonly: boolean;
  choice_list_name: string;
  appearance: string;
}

export interface BuilderChoice {
  _id: string;
  name: string;
  label: string;
}

export interface BuilderChoiceList {
  list_name: string;
  choices: BuilderChoice[];
}

export interface BuilderFormState {
  display_name: string;
  form_key: string;
  folder_schema: string;
  questions: BuilderQuestion[];
  choice_lists: BuilderChoiceList[];
}

// ── xlsform_json wire types ───────────────────────────────

export type XlsRow = Record<string, string | number | boolean | null>;

export interface XlsFormJson {
  survey: XlsRow[];
  choices: XlsRow[];
  settings: XlsRow[];
}

// ── Validation ────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
  questionId?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function makeQuestion(type: QuestionType): BuilderQuestion {
  return {
    _id: uid(),
    type,
    name: "",
    label: "",
    hint: "",
    required: false,
    constraint: "",
    constraint_message: "",
    relevant: "",
    default_value: "",
    calculation: "",
    readonly: false,
    choice_list_name: "",
    appearance: "",
  };
}

export function validate(state: BuilderFormState): ValidationError[] {
  const errors: ValidationError[] = [];
  validateMeta(state, errors);
  validateQuestions(state.questions, errors);
  return errors;
}

function validateMeta(
  state: BuilderFormState,
  errors: ValidationError[],
): void {
  if (!state.display_name.trim()) {
    errors.push({ field: "display_name", message: "Form title is required" });
  }

  if (!state.form_key.trim()) {
    errors.push({ field: "form_key", message: "Form key is required" });
  } else if (!/^[a-z0-9_]+$/.test(state.form_key)) {
    errors.push({
      field: "form_key",
      message: "Form key: lowercase letters, digits, and underscores only",
    });
  }

  if (!state.folder_schema.trim()) {
    errors.push({
      field: "folder_schema",
      message: "Sector / folder is required",
    });
  } else if (!/^[a-z_][a-z\d_]*$/.test(state.folder_schema)) {
    errors.push({
      field: "folder_schema",
      message:
        "Sector: start with a letter or underscore, then lowercase letters, digits, underscores",
    });
  }
}

const NAME_PATTERN = /^[a-zA-Z_]\w*$/;

function validateQuestions(
  questions: BuilderQuestion[],
  errors: ValidationError[],
): void {
  const dataQuestions = questions.filter((q) => !NO_NAME_TYPES.has(q.type));
  if (dataQuestions.length === 0) {
    errors.push({ field: "questions", message: "Add at least one question" });
  }

  const seenNames = new Set<string>();

  for (const q of questions) {
    if (NO_NAME_TYPES.has(q.type)) continue;
    validateQuestionName(q, seenNames, errors);
    validateQuestionLabel(q, errors);
    validateQuestionChoiceList(q, errors);
  }
}

function validateQuestionName(
  q: BuilderQuestion,
  seenNames: Set<string>,
  errors: ValidationError[],
): void {
  if (!q.name.trim()) {
    errors.push({
      field: "name",
      message: "Name is required",
      questionId: q._id,
    });
    return;
  }
  if (!NAME_PATTERN.test(q.name)) {
    errors.push({
      field: "name",
      message:
        "Start with a letter/underscore; only letters, digits, underscores",
      questionId: q._id,
    });
    return;
  }
  if (seenNames.has(q.name)) {
    errors.push({
      field: "name",
      message: `Duplicate name: "${q.name}"`,
      questionId: q._id,
    });
    return;
  }
  seenNames.add(q.name);
}

function validateQuestionLabel(
  q: BuilderQuestion,
  errors: ValidationError[],
): void {
  if (
    !NO_LABEL_TYPES.has(q.type) &&
    q.type !== "calculate" &&
    !q.label.trim()
  ) {
    errors.push({
      field: "label",
      message: "Label is required",
      questionId: q._id,
    });
  }
}

function validateQuestionChoiceList(
  q: BuilderQuestion,
  errors: ValidationError[],
): void {
  if (SELECT_TYPES.has(q.type) && !q.choice_list_name.trim()) {
    errors.push({
      field: "choice_list_name",
      message: "Assign a choice list to this question",
      questionId: q._id,
    });
  }
}

// ── Serialize: BuilderFormState → XlsFormJson ─────────────

export function serialize(state: BuilderFormState): XlsFormJson {
  return {
    survey: state.questions.map(questionToRow),
    choices: serializeChoices(state.choice_lists),
    settings: [
      {
        form_title: state.display_name || state.form_key,
        form_id: state.form_key,
      },
    ],
  };
}

function questionToRow(q: BuilderQuestion): XlsRow {
  const row: XlsRow = {
    type: SELECT_TYPES.has(q.type)
      ? `${q.type} ${q.choice_list_name || "choices"}`
      : q.type,
    name: q.name,
    label: q.label,
  };
  if (q.hint) row.hint = q.hint;
  if (q.required) row.required = "yes";
  if (q.constraint) row.constraint = q.constraint;
  if (q.constraint_message) row.constraint_message = q.constraint_message;
  if (q.relevant) row.relevant = q.relevant;
  if (q.default_value) row.default = q.default_value;
  if (q.calculation) row.calculation = q.calculation;
  if (q.readonly) row.readonly = "yes";
  if (q.appearance) row.appearance = q.appearance;
  return row;
}

function serializeChoices(choiceLists: BuilderChoiceList[]): XlsRow[] {
  const rows: XlsRow[] = [];
  for (const list of choiceLists) {
    for (const choice of list.choices) {
      rows.push({
        list_name: list.list_name,
        name: choice.name,
        label: choice.label,
      });
    }
  }
  return rows;
}

// ── Deserialize: XlsFormJson → BuilderFormState ───────────

export function deserialize(
  json: XlsFormJson,
  meta: { display_name: string; form_key: string; folder_schema: string },
): BuilderFormState {
  const questions: BuilderQuestion[] = (json.survey ?? []).map(
    (row): BuilderQuestion => {
      const rawType = String(row.type ?? "")
        .toLowerCase()
        .trim();
      const parts = rawType.split(" ");
      const baseType = parts[0] as QuestionType;
      return {
        _id: uid(),
        type: baseType,
        name: String(row.name ?? ""),
        label: String(row.label ?? ""),
        hint: String(row.hint ?? ""),
        required: String(row.required ?? "").toLowerCase() === "yes",
        constraint: String(row.constraint ?? ""),
        constraint_message: String(row.constraint_message ?? ""),
        relevant: String(row.relevant ?? ""),
        default_value: String(row.default ?? ""),
        calculation: String(row.calculation ?? ""),
        readonly: String(row.readonly ?? "").toLowerCase() === "yes",
        choice_list_name: SELECT_TYPES.has(baseType) ? (parts[1] ?? "") : "",
        appearance: String(row.appearance ?? ""),
      };
    },
  );

  const listMap = new Map<string, BuilderChoice[]>();
  for (const row of json.choices ?? []) {
    const ln = String(row.list_name ?? "");
    if (!ln) continue;
    if (!listMap.has(ln)) listMap.set(ln, []);
    const existing = listMap.get(ln) ?? [];
    existing.push({
      _id: uid(),
      name: String(row.name ?? ""),
      label: String(row.label ?? ""),
    });
    listMap.set(ln, existing);
  }

  return {
    ...meta,
    questions,
    choice_lists: [...listMap.entries()].map(([list_name, choices]) => ({
      list_name,
      choices,
    })),
  };
}

// ── UI helpers ────────────────────────────────────────────

export function typeColorClass(type: QuestionType): string {
  if (SELECT_TYPES.has(type)) return "bg-secondary/10 text-secondary";
  if (["image", "audio", "geopoint"].includes(type))
    return "bg-tertiary/10 text-tertiary";
  if (STRUCTURE_TYPES.has(type))
    return "bg-surface-container-high text-on-surface/60";
  if (type === "calculate") return "bg-primary/5 text-primary/70";
  return "bg-primary/10 text-primary";
}

/**
 * Compute the visual nesting depth for each question.
 * begin_group / begin_repeat open a level; end_group / end_repeat close it.
 * Returns an array parallel to `questions`.
 */
export function computeDepths(questions: BuilderQuestion[]): number[] {
  const depths: number[] = [];
  let depth = 0;
  for (const q of questions) {
    if (q.type === "end_group" || q.type === "end_repeat") {
      depth = Math.max(0, depth - 1);
    }
    depths.push(depth);
    if (q.type === "begin_group" || q.type === "begin_repeat") {
      depth += 1;
    }
  }
  return depths;
}
