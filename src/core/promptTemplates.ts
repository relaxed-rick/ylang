import type { PromptTemplateKey, PromptTemplateMap } from "./types";

export type PromptTemplateDefinition = {
  key: PromptTemplateKey;
  label: string;
  description: string;
  requiredPlaceholder?: string;
};

export const promptTemplateDefinitions: PromptTemplateDefinition[] = [
  {
    key: "lineTranslationSystem",
    label: "Line translation - system",
    description: "Rules for translating a complete subtitle line."
  },
  {
    key: "lineTranslationUser",
    label: "Line translation - user",
    description: "Template for the subtitle line translation request.",
    requiredPlaceholder: "text"
  },
  {
    key: "selectedTranslationSystem",
    label: "Selected text translation - system",
    description: "Rules for translating selected words or phrases."
  },
  {
    key: "selectedTranslationUser",
    label: "Selected text translation - user",
    description: "Template for selected word or phrase translation.",
    requiredPlaceholder: "text"
  },
  {
    key: "grammarSystem",
    label: "Grammar explanation - system",
    description: "Rules for compact grammar explanations."
  },
  {
    key: "grammarUser",
    label: "Grammar explanation - user",
    description: "Template for grammar questions.",
    requiredPlaceholder: "markedSentence"
  },
  {
    key: "attemptEvaluationSystem",
    label: "Attempt feedback - system",
    description: "Rules for feedback on a learner translation attempt."
  },
  {
    key: "attemptEvaluationUser",
    label: "Attempt feedback - user",
    description: "Template for a learner attempt.",
    requiredPlaceholder: "attempt"
  }
];

export const defaultPromptTemplates: Record<PromptTemplateKey, string> = {
  lineTranslationSystem: [
    "You produce close learning translations for subtitles.",
    "Do not write hidden reasoning, chain-of-thought, or <think> blocks.",
    "Translate from {{sourceLanguage}} to {{targetLanguage}}.",
    "Answer directly with the final translation only.",
    "Preserve meaning and useful structure.",
    "Keep names and culturally specific words unless a gloss is needed.",
    "Output only the translated subtitle line.",
    "No greeting, no quotes, no notes."
  ].join("\n"),
  lineTranslationUser: [
    "Source language: {{sourceLanguage}}",
    "Target language: {{targetLanguage}}",
    "Subtitle line: {{text}}"
  ].join("\n"),
  selectedTranslationSystem: [
    "You translate selected words or short phrases for a language learner.",
    "Do not write hidden reasoning, chain-of-thought, or <think> blocks.",
    "Translate from {{sourceLanguage}} to {{targetLanguage}}.",
    "Use only minor internal reasoning; answer directly.",
    "Be very compact.",
    "First line: the translation.",
    "Second line: a brief useful note about form, usage, or grammar if relevant.",
    "No greeting and no filler."
  ].join("\n"),
  selectedTranslationUser: [
    "Source language: {{sourceLanguage}}",
    "Target language: {{targetLanguage}}",
    "Full sentence: {{markedSentence}}",
    "Selected text: *{{text}}*"
  ].join("\n"),
  grammarSystem: [
    "You explain grammar for language learners.",
    "Do not write hidden reasoning, chain-of-thought, or <think> blocks.",
    "Use only minor internal reasoning; answer directly.",
    "Be compact. No greeting. No filler.",
    "Explain the underlying grammar rule when possible.",
    "Marked words are the target; the sentence is context.",
    "If one word is marked, often give verb tense/forms or noun indefinite/definite/plural forms.",
    "Also explain form, inflection, conjugation, or contrast when useful.",
    "If multiple words are marked, focus on phrase structure and word order.",
    "Use simple ASCII tables only when they reduce length.",
    "Do not translate the whole sentence unless needed."
  ].join("\n"),
  grammarUser: [
    "Source language: {{sourceLanguage}}",
    "Target language: {{targetLanguage}}",
    "Sentence: {{markedSentence}}",
    "Close translation: {{translation}}",
    "Marked selection: {{selectedText}}",
    "",
    "Explain the most relevant grammar point."
  ].join("\n"),
  attemptEvaluationSystem: [
    "Evaluate a learner translation attempt.",
    "No hidden reasoning, chain-of-thought, or <think> blocks.",
    "Judge meaning transfer from source to target.",
    "Ignore capitalization, punctuation, and minor style unless meaning changes.",
    "Use the ideal translation as reference when provided; otherwise infer cautiously.",
    "Output exactly four labeled lines:",
    "Original text: ...",
    "Ideal translation: ...",
    "User input: ...",
    "Feedback: main issue and how to fix it, compact."
  ].join("\n"),
  attemptEvaluationUser: [
    "Source language: {{sourceLanguage}}",
    "Target language: {{targetLanguage}}",
    "Original text: {{sentence}}",
    "Ideal translation: {{translation}}",
    "User input: {{attempt}}"
  ].join("\n")
};

export function mergePromptTemplates(custom: PromptTemplateMap | undefined): Record<PromptTemplateKey, string> {
  return {
    ...defaultPromptTemplates,
    ...(custom ?? {})
  };
}
