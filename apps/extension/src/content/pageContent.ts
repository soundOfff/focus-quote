export interface ExtractedPageContent {
  title: string | null
  content: string | null
}

export const extractPageContent = (maxChars = 4000): ExtractedPageContent => {
  const title = document.title?.trim() || null
  const raw = document.body?.innerText?.trim() ?? ""
  const content = raw.length > 0 ? raw.slice(0, maxChars) : null
  return { title, content }
}
