import { writable, derived } from "svelte/store";
import {
  makeQuestion,
  validate,
  type BuilderFormState,
  type BuilderQuestion,
  type BuilderChoice,
  type QuestionType,
} from "$lib/utils/xlsform";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── List helpers (extracted to avoid deep nesting) ────────

function patchChoiceInList(
  list_name: string,
  choice_id: string,
  patch: Partial<BuilderChoice>,
) {
  return (s: BuilderFormState): BuilderFormState => ({
    ...s,
    choice_lists: s.choice_lists.map((cl) => {
      if (cl.list_name !== list_name) return cl;
      return {
        ...cl,
        choices: cl.choices.map((c) =>
          c._id === choice_id ? { ...c, ...patch } : c,
        ),
      };
    }),
  });
}

function removeChoiceFromList(list_name: string, choice_id: string) {
  return (s: BuilderFormState): BuilderFormState => ({
    ...s,
    choice_lists: s.choice_lists.map((cl) => {
      if (cl.list_name !== list_name) return cl;
      return { ...cl, choices: cl.choices.filter((c) => c._id !== choice_id) };
    }),
  });
}

function empty(): BuilderFormState {
  return {
    display_name: "",
    form_key: "",
    folder_schema: "",
    questions: [],
    choice_lists: [],
  };
}

function createStore() {
  const { subscribe, update, set } = writable<BuilderFormState>(empty());

  return {
    subscribe,
    reset: () => set(empty()),
    load: (state: BuilderFormState) => set(state),

    setMeta: (
      patch: Partial<
        Pick<BuilderFormState, "display_name" | "form_key" | "folder_schema">
      >,
    ) => update((s) => ({ ...s, ...patch })),

    // ── Questions ────────────────────────────────────────
    addQuestion: (type: QuestionType) =>
      update((s) => {
        const q = makeQuestion(type);
        const additions: BuilderQuestion[] = [q];
        // Auto-pair structural markers
        if (type === "begin_group") additions.push(makeQuestion("end_group"));
        if (type === "begin_repeat") additions.push(makeQuestion("end_repeat"));
        return { ...s, questions: [...s.questions, ...additions] };
      }),

    updateQuestion: (id: string, patch: Partial<BuilderQuestion>) =>
      update((s) => ({
        ...s,
        questions: s.questions.map((q) =>
          q._id === id ? { ...q, ...patch } : q,
        ),
      })),

    removeQuestion: (id: string) =>
      update((s) => ({
        ...s,
        questions: s.questions.filter((q) => q._id !== id),
      })),

    moveQuestion: (fromIndex: number, toIndex: number) =>
      update((s) => {
        const qs = [...s.questions];
        const [moved] = qs.splice(fromIndex, 1);
        qs.splice(toIndex, 0, moved);
        return { ...s, questions: qs };
      }),

    // ── Choice lists ─────────────────────────────────────
    addChoiceList: (list_name: string) =>
      update((s) => ({
        ...s,
        choice_lists: [...s.choice_lists, { list_name, choices: [] }],
      })),

    removeChoiceList: (list_name: string) =>
      update((s) => ({
        ...s,
        choice_lists: s.choice_lists.filter((cl) => cl.list_name !== list_name),
      })),

    renameChoiceList: (oldName: string, newName: string) =>
      update((s) => ({
        ...s,
        choice_lists: s.choice_lists.map((cl) =>
          cl.list_name === oldName ? { ...cl, list_name: newName } : cl,
        ),
        questions: s.questions.map((q) =>
          q.choice_list_name === oldName
            ? { ...q, choice_list_name: newName }
            : q,
        ),
      })),

    addChoice: (list_name: string) =>
      update((s) => ({
        ...s,
        choice_lists: s.choice_lists.map((cl) =>
          cl.list_name === list_name
            ? {
                ...cl,
                choices: [...cl.choices, { _id: uid(), name: "", label: "" }],
              }
            : cl,
        ),
      })),

    updateChoice: (
      list_name: string,
      choice_id: string,
      patch: Partial<BuilderChoice>,
    ) => update(patchChoiceInList(list_name, choice_id, patch)),

    removeChoice: (list_name: string, choice_id: string) =>
      update(removeChoiceFromList(list_name, choice_id)),
  };
}

export const formBuilder = createStore();
export const formErrors = derived(formBuilder, ($s) => validate($s));
export const isFormValid = derived(formErrors, ($e) => $e.length === 0);
