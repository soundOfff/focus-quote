import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createWriteStream, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import { chromium } from "playwright"

export const ROOT = path.resolve(import.meta.dirname, "../..")
export const DEMO_DIR = path.join(ROOT, ".demo")
export const EXTENSION_DIR = path.join(DEMO_DIR, "extension")
export const DB_URL = `file:${path.join(DEMO_DIR, "demo.db")}`
export const API_PORT = 3917
export const FIXTURE_PORT = 4917
export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])
const TSX = path.join(ROOT, "node_modules/.bin/tsx")

/** Chrome derives an unpacked extension's id from its manifest `key`. */
export const pinExtensionId = () => {
  const key = readFileSync(path.join(import.meta.dirname, "extension-public-key.txt"), "utf8").trim()
  const manifestPath = path.join(EXTENSION_DIR, "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, key }, null, 2))
  const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32)
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("")
}

/** The only environment the demo server and seed ever see: no provider, mail or OAuth keys. */
export const demoServerEnv = (extensionId) => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "development",
  NODE_OPTIONS: `--import=${path.join(import.meta.dirname, "deny-egress.mjs")}`,
  PORT: String(API_PORT),
  DEMO_FIXTURES: "1",
  DATABASE_URL: DB_URL,
  BETTER_AUTH_SECRET: "portfolio-demo-only-not-a-real-secret",
  BETTER_AUTH_URL: `http://localhost:${API_PORT}`,
  BETTER_AUTH_TELEMETRY: "0",
  EXTENSION_ORIGIN: `chrome-extension://${extensionId}`,
})

export const runSeed = (extensionId, storageOut) =>
  new Promise((resolve, reject) => {
    const child = spawn(TSX, ["scripts/seed-demo.ts", storageOut], {
      cwd: path.join(ROOT, "apps/server"),
      env: demoServerEnv(extensionId),
      stdio: "inherit",
    })
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed exited ${code}`))))
  })

const healthy = async () => {
  try {
    return (await fetch(`http://localhost:${API_PORT}/health`)).ok
  } catch {
    return false
  }
}

/** Starts the API in its own process group; call the returned stop() to end tsx and its node child together. */
export const startApiServer = async (extensionId, logPath) => {
  if (await healthy()) throw new Error(`port ${API_PORT} is already serving; stop that process first`)
  const log = createWriteStream(logPath)
  const child = spawn(TSX, ["src/index.ts"], {
    cwd: path.join(ROOT, "apps/server"),
    env: demoServerEnv(extensionId),
    detached: true,
  })
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM")
    } catch {}
  }
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break
    if (await healthy()) return { stop }
    await new Promise((r) => setTimeout(r, 200))
  }
  stop()
  throw new Error(`API server did not become healthy; see ${logPath}`)
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml" }

export const startFixtureServer = () =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const file = path.join(import.meta.dirname, "fixtures", path.basename(new URL(req.url, FIXTURE_ORIGIN).pathname))
      try {
        const body = readFileSync(file)
        res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" })
        res.end(body)
      } catch {
        res.writeHead(404).end()
      }
    })
    server.on("error", reject)
    server.listen(FIXTURE_PORT, "127.0.0.1", () => resolve(server))
  })

/**
 * A fresh Chromium profile with the demo extension loaded. Every page and
 * service-worker request is logged; any non-local http(s) request is aborted,
 * and the resolver maps every other hostname to nothing as a second fence.
 */
export const launchBrowser = async () => {
  process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1"
  const profile = path.join(DEMO_DIR, "profile")
  rmSync(profile, { recursive: true, force: true })
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    // A real (not emulated) 1.25 scale so screencast frames arrive at 1600x1000;
    // the extra 87px of window height is the headless frame around a 1280x800 page.
    viewport: null,
    colorScheme: "light",
    args: [
      "--force-device-scale-factor=1.25",
      "--window-size=1280,887",
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      "--hide-scrollbars",
    ],
  })
  const requests = []
  context.on("request", (req) => {
    requests.push({ url: req.url(), method: req.method(), type: req.resourceType(), fromServiceWorker: Boolean(req.serviceWorker()) })
  })
  await context.route(/^(https?|wss?):/, (route) => {
    const host = new URL(route.request().url()).hostname
    return LOCAL_HOSTS.has(host) ? route.continue() : route.abort("blockedbyclient")
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
  const page = context.pages()[0] ?? (await context.newPage())
  return { context, page, worker, requests }
}

export const externalHosts = (requests) => [
  ...new Set(
    requests
      .map((r) => new URL(r.url))
      .filter((u) => /^(https?|wss?):$/.test(u.protocol) && !LOCAL_HOSTS.has(u.hostname))
      .map((u) => u.hostname),
  ),
]

/**
 * Extension pages lose some height to browser chrome that plain pages do not,
 * so resize the window until this page's viewport is exactly 1280x800 CSS px.
 */
export const fitViewport = async (page) => {
  const cdp = await page.context().newCDPSession(page)
  const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget")
  let height = bounds.height
  for (let attempt = 0; attempt < 4; attempt++) {
    const inner = await page.evaluate(() => innerHeight)
    if (inner === 800) break
    height += 800 - inner
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { height } })
    await page.waitForTimeout(150)
  }
  await cdp.detach()
}
