export interface TranslateLanguageOption {
  code: string
  label: string
}

export const TRANSLATE_LANGUAGES: ReadonlyArray<TranslateLanguageOption> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
]

export const isValidTranslateFrom = (code: string): boolean =>
  code === "auto" || TRANSLATE_LANGUAGES.some((lang) => lang.code === code)

export const isValidTranslateTo = (code: string): boolean =>
  TRANSLATE_LANGUAGES.some((lang) => lang.code === code)
