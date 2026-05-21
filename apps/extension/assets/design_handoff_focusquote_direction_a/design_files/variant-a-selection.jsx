// ───────── Direction A — Selection Toolbar ─────────
// Floating popover that appears over highlighted text.
// Same system as Variant A: paper, mono labels, single amber action.

function SelectionToolbar({ state = "default" }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "stretch",
      background: "#FBFAF6",
      border: "1px solid #DAD3C2",
      borderRadius: 10,
      padding: 4,
      gap: 4,
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.7) inset, " +
        "0 14px 32px -10px rgba(40,30,15,0.22), " +
        "0 3px 8px -2px rgba(40,30,15,0.10)",
      fontFamily: "'Geist', system-ui, sans-serif",
      color: "#1A1814",
    }}>
      {/* Save quote — the single amber action */}
      <button style={{
        background: state === "saved"
          ? "#E1EBDF"
          : "linear-gradient(180deg, #F4AC4F 0%, #EE9B30 100%)",
        color: state === "saved" ? "#4A6A47" : "#2A1A05",
        border: state === "saved" ? "1px solid #C6D7C2" : "1px solid #C77A1F",
        boxShadow: state === "saved"
          ? "none"
          : "0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,30,15,0.15)",
        borderRadius: 7,
        padding: "7px 11px 7px 9px",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        letterSpacing: "-0.005em",
        whiteSpace: "nowrap",
      }}>
        {state === "saved" ? <ICheck size={13} stroke={2.2} /> : <IBookmark size={13} stroke={1.8} />}
        {state === "saved" ? "Saved" : "Save quote"}
      </button>

      {/* hairline divider */}
      <div style={{ width: 1, background: "#E5E0D5", margin: "3px 1px" }} />

      {/* Translate pair */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        <LangPicker label="From" value="English" code="EN" />
        <ArrowCap />
        <LangPicker label="To" value="Spanish" code="ES" />
      </div>

      <div style={{ width: 1, background: "#E5E0D5", margin: "3px 1px" }} />

      {/* Translate icon button */}
      <button title="Translate selection" style={{
        background: "#F4F2EC",
        border: "1px solid #E5E0D5",
        borderRadius: 7,
        padding: "0 9px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: "#3A362F",
        fontSize: 11.5, fontWeight: 500,
      }}>
        <IGlobe size={13} stroke={1.7} style={{ color: "#807A6F" }} />
      </button>

      {/* Tag / more */}
      <button title="Add tag" style={{
        background: "transparent",
        border: "none",
        borderRadius: 7,
        padding: "0 8px",
        cursor: "pointer",
        color: "#807A6F",
        display: "inline-flex", alignItems: "center",
      }}>
        <ITag size={13} stroke={1.7} />
      </button>
    </div>
  );
}

function LangPicker({ label, value, code }) {
  return (
    <button style={{
      background: "#F4F2EC",
      border: "1px solid #E5E0D5",
      borderRadius: 7,
      padding: "5px 7px 5px 8px",
      cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: 7,
      color: "#1A1814",
      fontSize: 12, fontWeight: 500,
      lineHeight: 1.1,
      whiteSpace: "nowrap",
    }}>
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#807A6F", fontWeight: 500,
        }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{value}</span>
      </span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, fontWeight: 600,
        color: "#807A6F",
        background: "#FBFAF6",
        border: "1px solid #E5E0D5",
        borderRadius: 4,
        padding: "1px 4px",
        letterSpacing: "0.06em",
      }}>{code}</span>
      <IChevR size={10} style={{ color: "#B5AEA0", transform: "rotate(90deg)" }} />
    </button>
  );
}

function ArrowCap() {
  return (
    <span style={{
      width: 18, height: 24,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: "#B5AEA0",
    }}>
      <IArrow size={11} />
    </span>
  );
}

// Expanded language picker — dropdown state
function SelectionToolbar_Expanded({ state = "default" }) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <SelectionToolbar state={state} />
      {/* dropdown */}
      <div style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 198,
        width: 188,
        background: "#FBFAF6",
        border: "1px solid #DAD3C2",
        borderRadius: 10,
        padding: 6,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, " +
          "0 14px 28px -8px rgba(40,30,15,0.22), " +
          "0 3px 8px -2px rgba(40,30,15,0.10)",
        fontFamily: "'Geist', system-ui, sans-serif",
        color: "#1A1814",
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#807A6F", padding: "4px 8px 6px",
        }}>Translate to</div>
        <div style={{ position: "relative", marginBottom: 4, padding: "0 4px" }}>
          <ISearch size={12} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#B5AEA0" }} />
          <input placeholder="Filter…" style={{
            width: "100%", boxSizing: "border-box",
            background: "#F4F2EC", border: "1px solid #E5E0D5", borderRadius: 6,
            padding: "6px 8px 6px 28px",
            fontSize: 11.5, fontFamily: "inherit", color: "#1A1814",
            outline: "none",
          }} />
        </div>
        {[
          { l: "Spanish",    c: "ES", active: true },
          { l: "Portuguese", c: "PT" },
          { l: "French",     c: "FR" },
          { l: "German",     c: "DE" },
          { l: "Italian",    c: "IT" },
          { l: "Japanese",   c: "JA" },
        ].map(l => (
          <button key={l.c} style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 10px",
            background: l.active ? "#FBE6C8" : "transparent",
            border: "none", borderRadius: 6,
            cursor: "pointer",
            color: "#1A1814",
            fontSize: 12, fontWeight: l.active ? 600 : 500,
            fontFamily: "inherit",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {l.active && <ICheck size={11} stroke={2.2} style={{ color: "#C77A1F" }} />}
              {!l.active && <span style={{ width: 11 }} />}
              {l.l}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 600,
              color: "#807A6F",
              background: l.active ? "#FBFAF6" : "#F4F2EC",
              border: "1px solid #E5E0D5",
              borderRadius: 4, padding: "1px 4px",
              letterSpacing: "0.06em",
            }}>{l.c}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// In-context preview — toolbar over a page with highlighted text
function SelectionInContext({ state = "default" }) {
  const Bar = state === "expanded" ? SelectionToolbar_Expanded : SelectionToolbar;
  const barProps = state === "saved" ? { state: "saved" } : {};
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#FFFFFF",
      borderRadius: 0,
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Geist', system-ui, sans-serif",
      color: "#1A1814",
      padding: "26px 28px",
      boxSizing: "border-box",
    }}>
      {/* faux browser article */}
      <div style={{ maxWidth: 520 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9A9384", marginBottom: 8 }}>
          MDN · web docs
        </div>
        <h1 style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 28, fontWeight: 600, letterSpacing: "-0.015em",
          lineHeight: 1.1, margin: "0 0 14px",
        }}>
          The event loop and macro-task ordering
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: "#3A362F", margin: "0 0 12px" }}>
          JavaScript has a concurrency model based on an <em>event loop</em>, which
          is responsible for executing the code, collecting and processing events,
          and executing queued sub-tasks.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: "#3A362F", margin: 0 }}>
          The runtime drains all <span style={{
            background: "#FBE6C8",
            borderRadius: 2,
            padding: "1px 2px",
            boxShadow: "inset 0 -2px 0 rgba(199,122,31,0.18)",
          }}>microtasks before yielding to the next macro task — the render flush sits in between</span>, which is the
          single most important property to understand when reasoning about
          batched DOM updates and Promise resolution timing.
        </p>
      </div>

      {/* floating toolbar */}
      <div style={{
        position: "absolute",
        left: 32, top: 240,
      }}>
        {/* caret stem */}
        <div style={{
          position: "absolute", left: 60, top: -7,
          width: 12, height: 12, background: "#FBFAF6",
          border: "1px solid #DAD3C2",
          borderRight: "none", borderBottom: "none",
          transform: "rotate(45deg)",
        }} />
        <Bar {...barProps} />
      </div>

      {/* subtle label */}
      <div style={{
        position: "absolute", right: 24, bottom: 18,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: "#B5AEA0",
      }}>
        {state === "default" && "01 · default"}
        {state === "saved" && "02 · saved"}
        {state === "expanded" && "03 · language menu open"}
      </div>
    </div>
  );
}

// Anatomy diagram — labelled callouts pointing to each piece
function SelectionAnatomy() {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#F4F2EC",
      padding: "40px 32px",
      boxSizing: "border-box",
      fontFamily: "'Geist', system-ui, sans-serif",
      color: "#1A1814",
      position: "relative",
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: "#C77A1F", marginBottom: 8,
      }}>Anatomy</div>
      <div style={{
        fontFamily: "'Newsreader', Georgia, serif",
        fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em",
        lineHeight: 1.1, marginBottom: 28,
      }}>Selection toolbar — Direction A</div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
        <SelectionToolbar />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 28px",
        fontSize: 12.5, lineHeight: 1.55, color: "#3A362F",
      }}>
        {[
          { n: "01", t: "Save quote", d: "Sole amber action. Bookmark glyph + label. Becomes a sage \"Saved\" pill on confirmation." },
          { n: "02", t: "Language pair", d: "Paper-2 chips with a mono small-caps label above the language. ISO-639 code badge for quick recognition." },
          { n: "03", t: "Direction arrow", d: "Hairline arrow between chips — passive, not a button." },
          { n: "04", t: "Translate icon", d: "Globe glyph. Tertiary action; rarely needed when language pair is already set." },
          { n: "05", t: "Tag (overflow)", d: "Ghost button for secondary actions — tagging, more options. Reveals on hover." },
          { n: "06", t: "Caret + paper", d: "Same paper / hairline border / soft shadow as the popup, so the toolbar feels like one product." },
        ].map(c => (
          <div key={c.n} style={{ display: "flex", gap: 10 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: "#C77A1F",
              padding: "1px 6px",
              border: "1px solid #E8C7B7",
              borderRadius: 4, height: 16, alignSelf: "flex-start",
              letterSpacing: "0.06em",
            }}>{c.n}</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{c.t}</div>
              <div style={{ color: "#6B6760" }}>{c.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  SelectionToolbar, SelectionToolbar_Expanded,
  SelectionInContext, SelectionAnatomy,
});
