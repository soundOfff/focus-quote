import { defineManifest } from "@crxjs/vite-plugin"
import pkg from "./package.json" with { type: "json" }

export default defineManifest({
  manifest_version: 3,
  name: "FocusQuote",
  description: "Capture quotes from the web and run focus sessions.",
  version: pkg.version,
  icons: {
    16: "assets/icons/icon-16.png",
    48: "assets/icons/icon-48.png",
    128: "assets/icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "FocusQuote",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/content.ts"],
      run_at: "document_idle",
    },
  ],
  options_page: "src/options/index.html",
  chrome_url_overrides: {
    newtab: "src/newtab/index.html",
  },
  permissions: ["contextMenus", "storage", "alarms", "notifications", "activeTab"],
  host_permissions: ["<all_urls>"],
})
