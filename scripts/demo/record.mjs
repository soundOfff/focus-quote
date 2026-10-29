// Regenerates the portfolio demo end to end: extension build, scratch seed,
// API + fixture servers, a scripted Chromium run captured as screencast
// segments, then the encoded loop, poster, stills and chapters.
//   node scripts/demo/record.mjs [--out <dir>]
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import * as H from "./harness.mjs"

const outArg = process.argv.indexOf("--out")
const OUT = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(H.DEMO_DIR, "output"))
const WORK = path.join(H.DEMO_DIR, "recording")
const XFADE = 0.35
const BUDGET_BYTES = { "loop.mp4": 4_000_000, "loop.webm": 3_000_000, "poster.webp": 120_000, still: 150_000 }

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts })

const buildExtension = () =>
  run(path.join(H.ROOT, "node_modules/.bin/vite"), ["build", "--outDir", H.EXTENSION_DIR, "--emptyOutDir"], {
    cwd: path.join(H.ROOT, "apps/extension"),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, API_BASE_URL: `http://localhost:${H.API_PORT}` },
  })


const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="30" viewBox="-1 -1 15 21"><path d="M0 0 L0 16.2 L3.9 12.5 L6.6 18.6 L9.2 17.5 L6.6 11.6 L12 11.6 Z" fill="#14120f" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>`

const installCursor = async (page, at) => {
  await page.evaluate(
    ({ svg, x, y }) => {
      const el = document.createElement("div")
      el.innerHTML = svg
      Object.assign(el.style, {
        position: "fixed",
        left: "0",
        top: "0",
        zIndex: "2147483647",
        pointerEvents: "none",
        transform: `translate(${x - 1}px, ${y - 1}px)`,
        transformOrigin: "1px 1px",
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
        transition: "scale 110ms ease-out",
      })
      document.documentElement.appendChild(el)
      addEventListener("mousemove", (e) => (el.style.transform = `translate(${e.clientX - 1}px, ${e.clientY - 1}px)`), true)
      addEventListener("mousedown", () => (el.style.scale = "0.82"), true)
      addEventListener("mouseup", () => (el.style.scale = "1"), true)
    },
    { svg: CURSOR_SVG, ...at },
  )
  await page.mouse.move(at.x, at.y)
  return { page, x: at.x, y: at.y }
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const glide = async (cursor, x, y, ms = 650) => {
  const steps = Math.max(10, Math.round(ms / 18))
  const from = { x: cursor.x, y: cursor.y }
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps)
    await cursor.page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k)
    await cursor.page.waitForTimeout(12)
  }
  cursor.x = x
  cursor.y = y
}

const centerOf = async (locator, dx = 0) => {
  const b = await locator.boundingBox()
  if (!b) throw new Error(`no box for ${locator}`)
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 }
}

const glideClick = async (cursor, locator, ms) => {
  const c = await centerOf(locator)
  await glide(cursor, c.x, c.y, ms)
  await cursor.page.waitForTimeout(90)
  await cursor.page.mouse.down()
  await cursor.page.waitForTimeout(70)
  await cursor.page.mouse.up()
}


const jpegSize = (buf) => {
  for (let i = 2; i < buf.length - 9; i++) {
    if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`
  }
  return "unknown"
}

/** Screencasts one beat. `mark` records a named moment, in seconds from the segment's first frame. */
const recordSegment = async (page, name, script) => {
  const viewport = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio].join("x"))
  if (viewport !== "1280x800x1.25") throw new Error(`segment ${name}: viewport ${viewport}, expected 1280x800x1.25`)
  const dir = path.join(WORK, name)
  mkdirSync(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`)
    writeFileSync(file, Buffer.from(data, "base64"))
    frames.push({ file, t: metadata.timestamp })
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: 1600, maxHeight: 1000 })
  await page.waitForTimeout(150)
  const marks = []
  await script({ mark: (key) => marks.push({ key, wall: Date.now() / 1000 }) })
  const end = Date.now() / 1000
  await cdp.send("Page.stopScreencast")
  await cdp.detach()
  if (frames.length === 0) throw new Error(`segment ${name} captured no frames`)
  const size = jpegSize(readFileSync(frames[0].file))
  if (size !== "1600x1000") throw new Error(`segment ${name}: frames are ${size}, expected 1600x1000`)
  const start = frames[0].t
  return { name, frames, duration: end - start, marks: marks.map((m) => ({ key: m.key, t: Math.max(0, m.wall - start) })) }
}

const encodeSegment = (seg) => {
  const list = seg.frames
    .map((f, i) => {
      const next = seg.frames[i + 1]?.t ?? seg.frames[0].t + seg.duration
      return `file '${f.file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`
    })
    .join("\n")
  const listFile = path.join(WORK, `${seg.name}.ffconcat`)
  writeFileSync(listFile, `ffconcat version 1.0\n${list}\nfile '${seg.frames.at(-1).file}'\n`)
  const clip = path.join(WORK, `${seg.name}.mp4`)
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", "scale=1600:1000:flags=lanczos:in_range=pc:out_range=tv,fps=30,format=yuv420p", "-color_range", "tv", "-t", seg.duration.toFixed(3),
    "-c:v", "libx264", "-crf", "10", "-preset", "fast", clip])
  return clip
}


const quoteDragPoints = (page) =>
  page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.getElementById("quote-target"))
    const rects = range.getClientRects()
    const first = rects[0]
    const last = rects[rects.length - 1]
    return { from: { x: first.left + 1, y: first.top + first.height / 2 }, to: { x: last.right - 1, y: last.top + last.height / 2 } }
  })

const captureBeat = async (page) => {
  await page.goto(`${H.FIXTURE_ORIGIN}/spacing-effect.html`)
  await page.waitForSelector("#focusquote-fonts-host", { state: "attached" })
  await page.waitForTimeout(600)
  await H.fitViewport(page)
  const backdrop = await page.screenshot({ type: "jpeg", quality: 90 })
  const cursor = await installCursor(page, { x: 1040, y: 560 })
  const drag = await quoteDragPoints(page)
  const segment = await recordSegment(page, "capture", async ({ mark }) => {
    mark("chapter:capture")
    await page.waitForTimeout(500)
    await glide(cursor, drag.from.x, drag.from.y, 750)
    await page.mouse.down()
    await glide(cursor, drag.to.x, drag.to.y, 1000)
    await page.mouse.up()
    await page.waitForTimeout(650)
    mark("still:capture")
    await glideClick(cursor, page.getByText("Save quote"), 600)
    await page.waitForTimeout(1300)
  })
  return { segment, backdrop }
}

const tagGraphMemberships = async (token) => {
  const res = await fetch(`http://localhost:${H.API_PORT}/api/tags/graph`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await res.json()
  return body.memberships?.length ?? body.graph?.memberships?.length ?? 0
}

const tagRow = (page, name) => page.locator("div.group", { has: page.locator("span.truncate", { hasText: new RegExp(`^${name}$`) }) })

const dashboardBeat = async (page, ext, token, expectedMemberships) => {
  await page.goto(`${ext}/src/newtab/index.html`)
  const deadline = Date.now() + 20_000
  while ((await tagGraphMemberships(token)) < expectedMemberships) {
    if (Date.now() > deadline) throw new Error("the saved quote was never filed into a tag")
    await page.evaluate(() => chrome.runtime.sendMessage({ type: "focusquote.sync.now" }).catch(() => {}))
    await page.waitForTimeout(700)
  }
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "focusquote.sync.now" }).catch(() => {}))
  await page.waitForTimeout(1200)
  await page.reload()
  await page.getByText(/Good (morning|afternoon|evening), Ada/).waitFor()
  await page.waitForTimeout(800)
  await H.fitViewport(page)
  const cursor = await installCursor(page, { x: 820, y: 470 })
  const segment = await recordSegment(page, "dashboard", async ({ mark }) => {
    mark("chapter:dashboard")
    await page.waitForTimeout(1300)
    await glideClick(cursor, page.getByText("Quotes", { exact: true }).first(), 700)
    await tagRow(page, "Learning").waitFor()
    await page.waitForTimeout(700)
    await glideClick(cursor, tagRow(page, "Learning").getByRole("button", { name: "Expand" }), 550)
    await page.waitForTimeout(500)
    await glideClick(cursor, tagRow(page, "Memory").locator("button[aria-pressed]"), 500)
    await page.waitForTimeout(500)
    await glide(cursor, cursor.x + 420, cursor.y - 50, 600)
    mark("still:dashboard")
    await page.waitForTimeout(1200)
  })
  return segment
}

const popupBeat = async (page, ext, backdrop) => {
  await page.goto(`${ext}/src/popup/index.html`)
  await page.getByPlaceholder(/Session title/).waitFor()
  await page.addStyleTag({
    content: `
      html { background: #e9e4da url(data:image/jpeg;base64,${backdrop.toString("base64")}) 0 0 / 1280px 800px no-repeat !important; height: 100%; overflow: hidden !important; }
      html::before { content: ""; position: fixed; inset: 0; background: rgba(18, 16, 12, 0.22); }
      body { position: fixed !important; top: 12px !important; right: 20px !important; margin: 0 !important; zoom: 1.25; overflow: hidden !important;
             border-radius: 10px; box-shadow: 0 26px 60px -14px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.28); }
      #root > div { max-height: 600px !important; }
    `,
  })
  await page.waitForTimeout(400)
  await H.fitViewport(page)
  const cursor = await installCursor(page, { x: 560, y: 260 })
  const segment = await recordSegment(page, "session", async ({ mark }) => {
    mark("chapter:session")
    await page.waitForTimeout(500)
    await glideClick(cursor, page.getByPlaceholder(/Session title/), 650)
    await page.keyboard.type("Spacing effect deep dive", { delay: 42 })
    await page.waitForTimeout(250)
    await glideClick(cursor, page.locator('[aria-haspopup="listbox"]').first(), 500)
    await page.waitForTimeout(350)
    await glideClick(cursor, page.getByRole("option", { name: /Cognitive Science/ }), 450)
    await page.waitForTimeout(300)
    await glideClick(cursor, page.getByText(/Start 25-min session/), 550)
    await page.waitForTimeout(800)
    mark("still:session")
    await page.waitForTimeout(1200)
  })
  return segment
}

const reportBeat = async (page, ext, reportSessionId) => {
  await page.goto(`${ext}/src/newtab/index.html#/session/${reportSessionId}`)
  await page.getByText("AI summary").waitFor()
  await page.getByPlaceholder("Your answer…").waitFor()
  await page.waitForTimeout(700)
  await H.fitViewport(page)
  const cursor = await installCursor(page, { x: 1060, y: 470 })
  const answer = page.getByPlaceholder("Your answer…")
  const segment = await recordSegment(page, "report", async ({ mark }) => {
    mark("chapter:report")
    await page.waitForTimeout(600)
    mark("still:report")
    await page.waitForTimeout(1600)
    await page.evaluate(() => {
      const scroller = document.querySelector(".fq-session-detail")
      const box = document.querySelector("textarea.textarea").getBoundingClientRect()
      scroller.scrollTo({ top: scroller.scrollTop + box.top - 300, behavior: "smooth" })
    })
    await page.waitForTimeout(900)
    mark("chapter:recall")
    await glideClick(cursor, answer, 650)
    await page.keyboard.type("Retention drops fast after learning, then levels off unless you review.", { delay: 26 })
    await page.waitForTimeout(200)
    await glideClick(cursor, page.getByRole("button", { name: /Submit/ }), 500)
    await page.locator(".recall-result").waitFor()
    await glide(cursor, cursor.x + 190, cursor.y + 120, 500)
    mark("still:recall")
    await page.waitForTimeout(1400)
  })
  return segment
}


const CHAPTERS = [
  { key: "capture", label: "Save a quote while reading" },
  { key: "dashboard", label: "AI tags every quote" },
  { key: "session", label: "Start a focus session" },
  { key: "report", label: "Read the AI session report" },
  { key: "recall", label: "AI-graded recall quiz" },
]

const assemble = (segments, clips) => {
  const offsets = []
  let acc = 0
  for (const s of segments) {
    offsets.push(acc)
    acc += s.duration - XFADE
  }
  const firstPng = path.join(WORK, "first-frame.png")
  const firstFrame = path.join(WORK, "first-frame.mp4")
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", clips[0], "-frames:v", "1", firstPng])
  run("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-framerate", "30", "-t", (XFADE + 0.1).toFixed(2), "-i", firstPng,
    "-c:v", "libx264", "-crf", "10", "-pix_fmt", "yuv420p", firstFrame])
  const inputs = [...clips, firstFrame]
  const norm = inputs.map((_, i) => `[${i}:v]settb=AVTB,fps=30,format=yuv420p[n${i}]`)
  const chain = []
  let prev = "n0"
  let length = segments[0].duration
  for (let i = 1; i < inputs.length; i++) {
    const out = i === inputs.length - 1 ? "vout" : `x${i}`
    chain.push(`[${prev}][n${i}]xfade=transition=fade:duration=${XFADE}:offset=${(length - XFADE).toFixed(3)}[${out}]`)
    length += (i < segments.length ? segments[i].duration : XFADE + 0.1) - XFADE
    prev = out
  }
  const mp4 = path.join(OUT, "loop.mp4")
  run("ffmpeg", ["-y", "-loglevel", "error", ...inputs.flatMap((f) => ["-i", f]), "-filter_complex", [...norm, ...chain].join(";"),
    "-map", "[vout]", "-an", "-r", "30", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-color_range", "tv", "-crf", "26", "-preset", "slow",
    "-movflags", "+faststart", mp4])
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", path.join(OUT, "loop.webm")])
  // A mark inside a segment's fade-in maps to the end of that fade, so a
  // chapter seek or a still never lands on a blend of two beats.
  const at = (key) => {
    for (const [i, s] of segments.entries()) {
      const m = s.marks.find((x) => x.key === key)
      if (m) return offsets[i] + (i === 0 ? m.t : Math.max(m.t, XFADE))
    }
    throw new Error(`missing mark ${key}`)
  }
  return { at }
}

const webp = (srcVideo, t, dest, budget) => {
  const png = `${dest}.png`
  run("ffmpeg", ["-y", "-loglevel", "error", "-ss", t.toFixed(3), "-i", srcVideo, "-frames:v", "1", png])
  for (const q of [82, 74, 66, 58]) {
    run("cwebp", ["-quiet", "-q", String(q), png, "-o", dest])
    if (statSync(dest).size <= budget) break
  }
  rmSync(png)
}


rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
mkdirSync(path.join(OUT, "stills"), { recursive: true })

console.log("[record] building extension")
buildExtension()
const extensionId = H.pinExtensionId()
const ext = `chrome-extension://${extensionId}`

console.log("[record] seeding scratch database")
rmSync(path.join(H.DEMO_DIR, "demo.db"), { force: true })
const storageFile = path.join(H.DEMO_DIR, "storage.json")
await H.runSeed(extensionId, storageFile)
const seed = JSON.parse(readFileSync(storageFile, "utf8"))
const token = seed.storage["focusquote.authToken"]

const serverLog = path.join(H.DEMO_DIR, "server.log")
const server = await H.startApiServer(extensionId, serverLog)
const fixtures = await H.startFixtureServer()
const { context, page, worker, requests } = await H.launchBrowser()
let segments
try {
  if (worker.url() !== `${ext}/service-worker-loader.js`) throw new Error(`unexpected extension id: ${worker.url()}`)
  await worker.evaluate((s) => chrome.storage.local.set(s), seed.storage)
  const membershipsBefore = await tagGraphMemberships(token)

  console.log("[record] recording beats")
  const capture = await captureBeat(page)
  const dashboard = await dashboardBeat(page, ext, token, membershipsBefore + 1)
  const session = await popupBeat(page, ext, capture.backdrop)
  const report = await reportBeat(page, ext, seed.reportSessionId)
  segments = [capture.segment, dashboard, session, report]
} finally {
  await context.close()
  server.stop()
  fixtures.close()
}

const hosts = H.externalHosts(requests)
writeFileSync(path.join(H.DEMO_DIR, "network-log.json"), JSON.stringify({ externalHosts: hosts, requests }, null, 2))
const egress = readFileSync(serverLog, "utf8").split("\n").filter((l) => l.startsWith("[egress] blocked"))
if (hosts.length > 0 || egress.length > 0) {
  console.error(`[record] external traffic attempted: browser ${hosts.join(", ") || "none"}; server ${egress.join("; ") || "none"}`)
  process.exit(1)
}

console.log("[record] encoding")
const clips = segments.map(encodeSegment)
const { at } = assemble(segments, clips)
const mp4 = path.join(OUT, "loop.mp4")
webp(mp4, 0, path.join(OUT, "poster.webp"), BUDGET_BYTES["poster.webp"])
const chapters = CHAPTERS.map((c, i) => {
  const still = `stills/${String(i + 1).padStart(2, "0")}-${c.key}.webp`
  webp(mp4, at(`still:${c.key}`), path.join(OUT, still), BUDGET_BYTES.still)
  return { t: i === 0 ? 0 : Number(at(`chapter:${c.key}`).toFixed(2)), label: c.label, still }
})
const measured = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim())
writeFileSync(path.join(OUT, "chapters.json"), `${JSON.stringify({ duration: Number(measured.toFixed(2)), chapters }, null, 2)}\n`)

const sheetInputs = [...chapters.map((c) => path.join(OUT, c.still))]
run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", "fps=1/2,scale=400:-1,tile=4x4", "-frames:v", "1", path.join(WORK, "contact-frames.png")])
run("ffmpeg", ["-y", "-loglevel", "error", ...sheetInputs.flatMap((f) => ["-i", f]), "-filter_complex",
  `${sheetInputs.map((_, i) => `[${i}:v]scale=400:-1[s${i}]`).join(";")};${sheetInputs.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${sheetInputs.length}`,
  path.join(WORK, "contact-stills.png")])

const over = []
for (const f of ["loop.mp4", "loop.webm", "poster.webp", ...chapters.map((c) => c.still)]) {
  const size = statSync(path.join(OUT, f)).size
  const budget = BUDGET_BYTES[f] ?? BUDGET_BYTES.still
  console.log(`[record] ${f} ${size} bytes (budget ${budget})`)
  if (size > budget) over.push(f)
}
console.log(`[record] ${requests.length} requests, external hosts: ${hosts.length}; duration ${measured.toFixed(2)}s`)
if (over.length > 0) {
  console.error(`[record] over budget: ${over.join(", ")}`)
  process.exit(1)
}
