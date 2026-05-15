import type { ComponentChildren } from "preact"
import { Home, Moon, Plus, Settings as SettingsIcon, Sun } from "lucide-preact"
import type { Theme } from "@focus-quote/shared"
import { Button } from "./primitives"
import { requestOpenExtensionPopup } from "../shared/open-popup"

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

export type AppPage = "home" | "options" | "session-detail"

interface AppShellProps {
  page: AppPage
  theme?: Theme
  onToggleTheme?: () => void
  children: ComponentChildren
  /** Short date in header, e.g. "FRI, MAY 15" */
  headerDate?: string
  /** When false, omits the new-session CTA (e.g. narrow surfaces). */
  showNewSession?: boolean
}

const openOptions = () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage()
  } else {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/options/index.html"),
    })
  }
}

const openNewtab = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/newtab/index.html") })
}

export function AppShell({
  page,
  theme,
  onToggleTheme,
  children,
  headerDate,
  showNewSession = true,
}: AppShellProps) {
  return (
    <div class="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-body">
      <AppNavBar
        page={page}
        theme={theme}
        onToggleTheme={onToggleTheme}
        headerDate={headerDate}
        showNewSession={showNewSession}
      />
      <main class="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}

interface NavBarProps {
  page: AppPage
  theme?: Theme
  onToggleTheme?: () => void
  headerDate?: string
  showNewSession?: boolean
}

export function AppNavBar({
  page,
  theme,
  onToggleTheme,
  headerDate,
  showNewSession,
}: NavBarProps) {
  return (
    <header class="flex shrink-0 items-center justify-between gap-4 border-b border-hairline bg-surface px-4 py-3 sm:px-6">
      <div class="flex min-w-0 flex-1 items-center gap-4 sm:gap-8">
        <span class="shrink-0 text-sm font-bold tracking-tight text-ink">
          FocusQuote
        </span>
        <nav class="flex items-center gap-1">
          <NavLink
            label="Home"
            icon={<Home size={14} strokeWidth={2} />}
            active={page === "home" || page === "session-detail"}
            onClick={page === "options" ? openNewtab : undefined}
          />
          <NavLink
            label="Options"
            icon={<SettingsIcon size={14} strokeWidth={2} />}
            active={page === "options"}
            onClick={page !== "options" ? openOptions : undefined}
          />
        </nav>
      </div>
      <div class="flex shrink-0 items-center gap-2 sm:gap-3">
        {headerDate && (
          <time
            class="hidden font-mono text-[10px] font-medium uppercase tracking-wide text-mute sm:block"
            dateTime={new Date().toISOString().slice(0, 10)}
          >
            {headerDate}
          </time>
        )}
        {showNewSession && (
          <Button
            variant="primary"
            size="sm"
            type="button"
            class="rounded-md font-bold shadow-none"
            onClick={() => requestOpenExtensionPopup()}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />
            New session
          </Button>
        )}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            class="flex h-10 w-10 items-center justify-center rounded-md text-mute transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 active:scale-[0.96] motion-reduce:active:scale-100"
          >
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        )}
      </div>
    </header>
  )
}

function NavLink({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ComponentChildren
  active: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-current={active ? "page" : undefined}
      class={cx(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        active
          ? "bg-surface-soft font-semibold text-ink"
          : "text-mute hover:bg-surface-doc hover:text-body",
        !onClick && "cursor-default",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
