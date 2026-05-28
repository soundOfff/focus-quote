import type { Quote } from "@focus-quote/shared"

/** Display label for the bucket holding quotes with no folder (blank/absent tag). */
export const UNFILED_LABEL = "Unfiled"

export interface QuoteFolder {
  /** The tag backing this folder, or null for the Unfiled bucket. */
  tag: string | null
  label: string
  count: number
}

/** The folder a quote belongs to: its trimmed tag, or null when blank/absent. */
export const folderTagOf = (quote: Pick<Quote, "tag">): string | null => {
  const trimmed = quote.tag?.trim()
  return trimmed ? trimmed : null
}

/**
 * Group quotes into folders. Real folders (non-blank tags) come first, sorted
 * case-insensitively; the Unfiled bucket, if any, comes last. Folders are
 * keyed by the exact trimmed tag, so "React" and "react" are distinct.
 */
export const groupQuotesIntoFolders = (
  quotes: ReadonlyArray<Pick<Quote, "tag">>,
): QuoteFolder[] => {
  const counts = new Map<string | null, number>()
  for (const q of quotes) {
    const tag = folderTagOf(q)
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }

  const folders: QuoteFolder[] = []
  for (const [tag, count] of counts) {
    if (tag === null) continue
    folders.push({ tag, label: tag, count })
  }
  folders.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  )

  const unfiled = counts.get(null)
  if (unfiled) folders.push({ tag: null, label: UNFILED_LABEL, count: unfiled })
  return folders
}

/**
 * Folder filter selection: `undefined` = All (no filter), `null` = the Unfiled
 * bucket, a string = that folder's tag.
 */
export type FolderSelection = string | null | undefined

export const filterQuotesByFolder = <T extends Pick<Quote, "tag">>(
  quotes: ReadonlyArray<T>,
  selected: FolderSelection,
): T[] => {
  if (selected === undefined) return [...quotes]
  return quotes.filter((q) => folderTagOf(q) === selected)
}
