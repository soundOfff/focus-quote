// ───────── Direction A — In-page tool rail ─────────
// Floating rail + the four mode panels it opens.

// ─── 1. The rail itself ──────────────────────────────────────────
function ToolRail({ active = "annotate", collapsed = false }) {
  if (collapsed) {
    return (
      <div style={{
        width: 34, padding: "6px 0",
        background: "#FBFAF6",
        border: "1px solid #DAD3C2",
        borderRadius: 10,
        boxShadow: "0 1px 0 rgba(255,255,255,0.7) inset, 0 10px 22px -10px rgba(40,30,15,0.22)",
        display: "flex", justifyContent: "center",
      }}>
        <button style={railBtn(false)}><IChevR size={14} /></button>
      </div>
    );
  }
  const tools = [
    { k: "alerts",   I: IBell,   label: "Alerts" },
    { k: "annotate", I: IPen,    label: "Annotate" },
    { k: "quote",    I: IQuote,  label: "Quote + AI" },
    { k: "guide",    I: ISparkle,label: "Guide me" },
  ];
  return (
    <div style={{
      width: 42,
      background: "#FBFAF6",
      border: "1px solid #DAD3C2",
      borderRadius: 11,
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.7) inset, " +
        "0 14px 30px -10px rgba(40,30,15,0.22), " +
        "0 3px 8px -2px rgba(40,30,15,0.10)",
      padding: "5px 4px",
      display: "flex", flexDirection: "column", alignItems: "stretch", gap: 2,
      fontFamily: "'Geist', system-ui, sans-serif",
    }}>
      {tools.map(t => (
        <button key={t.k} title={t.label} style={railBtn(active === t.k)}>
          <t.I size={15} stroke={1.8} />
        </button>
      ))}
      <div style={{ height: 1, background: "#E5E0D5", margin: "5px 5px" }} />
      <button style={railBtn(false)}>
        <IChevR size={13} stroke={1.8} />
      </button>
    </div>
  );
}

function railBtn(active) {
  return {
    height: 32, width: 34,
    display: "grid", placeItems: "center",
    background: active ? "#FBE6C8" : "transparent",
    color: active ? "#C77A1F" : "#3A362F",
    border: active ? "1px solid #ECCE9E" : "1px solid transparent",
    borderRadius: 7,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

// quote glyph
const IQuote = ({ size = 16, stroke = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 7h3v4H6V8c0-1.5 1-3 3-3M16 7h3v4h-4V8c0-1.5 1-3 3-3" />
    <path d="M6 14v3M15 14v3" opacity="0.5"/>
  </svg>
);
const IBell = ({ size = 16, stroke = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 16H6a2 2 0 0 1-1.4-3.4L5 12c.6-.6 1-1.4 1-2.2V8a6 6 0 0 1 12 0v1.8c0 .8.4 1.6 1 2.2l.4.6A2 2 0 0 1 18 16zM10 20a2 2 0 0 0 4 0" />
  </svg>
);
const ISparkle = ({ size = 16, stroke = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" opacity="0.18" />
  </svg>
);

// ─── 2. Annotate top toolbar ─────────────────────────────────────
function AnnotateToolbar() {
  return (
    <div style={{
      display: "inline-flex", alignItems: "stretch",
      background: "#FBFAF6",
      border: "1px solid #DAD3C2",
      borderRadius: 10,
      padding: 5,
      gap: 4,
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.7) inset, " +
        "0 14px 30px -10px rgba(40,30,15,0.22), " +
        "0 3px 8px -2px rgba(40,30,15,0.10)",
      fontFamily: "'Geist', system-ui, sans-serif",
      color: "#1A1814",
    }}>
      {/* Mode badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "5px 10px 5px 9px",
        background: "#FBE6C8", borderRadius: 7, border: "1px solid #ECCE9E",
      }}>
        <IPen size={13} stroke={1.9} style={{ color: "#C77A1F" }} />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#C77A1F", fontWeight: 600,
        }}>Annotate</span>
      </div>

      <Divider />

      {/* Tool selector — pen | highlight | erase */}
      <div style={{
        display: "inline-flex", alignItems: "center",
        background: "#F4F2EC", border: "1px solid #E5E0D5", borderRadius: 7,
        padding: 2, gap: 2,
      }}>
        {[
          { k: "pen",  I: IPen,    active: true },
          { k: "high", I: IBolt },
          { k: "era",  I: IX },
        ].map(t => (
          <button key={t.k} style={{
            width: 26, height: 24, display: "grid", placeItems: "center",
            background: t.active ? "#FBFAF6" : "transparent",
            border: t.active ? "1px solid #DAD3C2" : "1px solid transparent",
            borderRadius: 5,
            color: t.active ? "#1A1814" : "#807A6F",
            cursor: "pointer", boxShadow: t.active ? "0 1px 2px rgba(40,30,15,0.08)" : "none",
          }}>
            <t.I size={12} stroke={1.8} />
          </button>
        ))}
      </div>

      {/* Color swatches */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
        {["#C77A1F", "#1A1814", "#2E5C73", "#4A6A47", "#A04B26"].map((c, i) => (
          <button key={c} style={{
            width: 16, height: 16, borderRadius: 999,
            background: c,
            border: i === 0 ? "2px solid #FBFAF6" : "2px solid transparent",
            outline: i === 0 ? "1px solid #C77A1F" : "1px solid #E5E0D5",
            outlineOffset: 0,
            cursor: "pointer", padding: 0,
          }} />
        ))}
      </div>

      {/* Stroke slider */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "0 10px 0 4px",
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#807A6F",
        }}>Stroke</span>
        <div style={{
          position: "relative", width: 96, height: 18,
          display: "flex", alignItems: "center",
        }}>
          <div style={{ position: "absolute", inset: "8px 0", height: 2, background: "#E5E0D5", borderRadius: 99 }} />
          <div style={{ position: "absolute", left: 0, top: 8, height: 2, width: "55%", background: "#C77A1F", borderRadius: 99 }} />
          <div style={{
            position: "absolute", left: "calc(55% - 7px)", top: 2,
            width: 14, height: 14, borderRadius: 999,
            background: "#FBFAF6", border: "1px solid #C77A1F",
            boxShadow: "0 1px 2px rgba(40,30,15,0.15)",
          }} />
        </div>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: "#3A362F", fontWeight: 500,
          minWidth: 22, textAlign: "right",
        }}>3.2</span>
      </div>

      <Divider />

      {/* Undo / Redo */}
      <button style={ghostIconBtn()} title="Undo">
        <IUndo size={13} stroke={1.7} />
      </button>
      <button style={ghostIconBtn()} title="Redo">
        <IUndo size={13} stroke={1.7} style={{ transform: "scaleX(-1)" }} />
      </button>

      {/* Clear */}
      <button style={{
        ...ghostBtn(),
        color: "#A04B26",
        borderColor: "#E8C7B7",
      }}>
        <ITrash size={12} stroke={1.7} /> Clear
      </button>

      {/* Save PNG — single amber action */}
      <button style={amberBtn()}>
        <IDownload size={12} stroke={2} /> Save PNG
      </button>

      <Divider />

      <button style={{ ...ghostBtn(), padding: "6px 9px" }}>
        <IX size={12} stroke={2} /> Exit
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: "#E5E0D5", margin: "4px 1px" }} />;
}
function ghostBtn() {
  return {
    background: "#F4F2EC",
    border: "1px solid #E5E0D5",
    borderRadius: 7,
    padding: "6px 10px",
    fontSize: 12, fontWeight: 500,
    color: "#3A362F",
    display: "inline-flex", alignItems: "center", gap: 5,
    cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: "inherit",
  };
}
function ghostIconBtn() {
  return {
    width: 28, height: 28,
    display: "grid", placeItems: "center",
    background: "transparent", border: "1px solid transparent",
    borderRadius: 6, color: "#3A362F", cursor: "pointer",
  };
}
function amberBtn() {
  return {
    background: "linear-gradient(180deg, #F4AC4F 0%, #EE9B30 100%)",
    color: "#2A1A05",
    border: "1px solid #C77A1F",
    borderRadius: 7,
    padding: "6px 11px",
    fontSize: 12, fontWeight: 600,
    boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,30,15,0.15)",
    display: "inline-flex", alignItems: "center", gap: 6,
    cursor: "pointer", whiteSpace: "nowrap",
    letterSpacing: "-0.005em",
    fontFamily: "inherit",
  };
}

// extra icons used here
const IUndo = ({ size = 16, stroke = 1.6, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);
const ITrash = ({ size = 16, stroke = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M10 7V4h4v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
  </svg>
);
const IDownload = ({ size = 16, stroke = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
  </svg>
);

// ─── 3. Quote + AI panel ─────────────────────────────────────────
function QuoteAIPanel({ state = "default" }) {
  return (
    <div style={panelShell(320)}>
      <PanelHeader kicker="Quote · AI" tone="amber" />

      {/* Quoted passage */}
      <div style={{ padding: "12px 14px 4px" }}>
        <div style={{
          background: "#FBFAF6", border: "1px solid #E5E0D5",
          borderRadius: 9, padding: "10px 12px 10px 14px",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", left: 0, top: 8, bottom: 8,
            width: 3, background: "#F2A03C", borderRadius: 99,
          }} />
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#807A6F", marginBottom: 5,
          }}>From x.com · 17:42</div>
          <div style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic", fontSize: 13, lineHeight: 1.45,
            color: "#1A1814", letterSpacing: "-0.005em",
          }}>
            La delegación de EE.UU. tira todos los regalos y artículos chinos antes de regresar. Justo antes de subir al Air Force One en China, los integrantes de la delegación estadounidense…
          </div>
        </div>
      </div>

      {/* AI response */}
      <div style={{ padding: "10px 14px 4px" }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#4A6A47", display: "flex", alignItems: "center", gap: 5, marginBottom: 6,
        }}>
          <ISparkle size={11} stroke={2} /> Summary
        </div>
        <p style={{
          margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "#3A362F",
        }}>
          The passage states that members of the U.S. delegation, including the president, disposed of all gifts and China-made items in a trash container before boarding Air Force One to leave China.
        </p>

        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#807A6F", marginTop: 12, marginBottom: 4,
        }}>Suggested follow-ups</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {[
            "Why did the U.S. delegation dispose of all Chinese-made items?",
            "Where did this event take place?",
            "Was this confirmed by any official source?",
          ].map((q, i) => (
            <li key={i}>
              <button style={{
                width: "100%", textAlign: "left",
                background: "#F4F2EC", border: "1px solid #E5E0D5",
                borderRadius: 7, padding: "7px 9px",
                fontSize: 12, fontWeight: 500, color: "#1A1814",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                fontFamily: "inherit", lineHeight: 1.3,
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, color: "#C77A1F", fontWeight: 600,
                  letterSpacing: "0.06em",
                  border: "1px solid #E8C7B7", borderRadius: 4,
                  padding: "1px 4px", flexShrink: 0,
                }}>{String(i + 1).padStart(2, "0")}</span>
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer composer */}
      <PanelComposer placeholder="Ask a follow-up — or leave blank to star ★"
                     button="Ask" hint="⌘ ↵" />
    </div>
  );
}

// ─── 4. Guide me panel ───────────────────────────────────────────
function GuidePanel() {
  return (
    <div style={panelShell(320)}>
      <PanelHeader kicker="Guide me" tone="amber" />

      <div style={{ padding: "12px 14px 4px" }}>
        <p style={{
          margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "#3A362F",
        }}>
          Describe what you want to do — for example, <span style={{ color: "#1A1814", fontWeight: 600 }}>"show me how to disable my account"</span>. I'll trace a ghost cursor through the steps.
        </p>

        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#807A6F", marginTop: 14, marginBottom: 5,
        }}>Recent</div>
        <div style={{ display: "grid", gap: 4 }}>
          {[
            "How do I export my data?",
            "Where do I change my email?",
          ].map((q, i) => (
            <button key={i} style={{
              width: "100%", textAlign: "left",
              background: "transparent", border: "1px dashed #D9D3C5",
              borderRadius: 7, padding: "6px 9px",
              fontSize: 12, color: "#3A362F", cursor: "pointer",
              fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <IArrow size={10} stroke={1.8} style={{ color: "#B5AEA0" }} /> {q}
            </button>
          ))}
        </div>
      </div>

      <PanelComposer placeholder="How do I…"
                     button="Generate" hint="↵" />
    </div>
  );
}

// ─── shared panel pieces ─────────────────────────────────────────
function panelShell(w) {
  return {
    width: w,
    background: "#FBFAF6",
    border: "1px solid #DAD3C2",
    borderRadius: 12,
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.7) inset, " +
      "0 18px 36px -12px rgba(40,30,15,0.22), " +
      "0 3px 10px -2px rgba(40,30,15,0.10)",
    fontFamily: "'Geist', system-ui, sans-serif",
    color: "#1A1814",
    overflow: "hidden",
  };
}

function PanelHeader({ kicker, tone }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 12px 10px 14px",
      borderBottom: "1px solid #E5E0D5",
      background: "#F4F2EC",
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
        fontWeight: 600, color: tone === "amber" ? "#C77A1F" : "#3A362F",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "#F2A03C" }} />
        {kicker}
      </div>
      <button style={{
        width: 22, height: 22, display: "grid", placeItems: "center",
        background: "transparent", border: "none",
        borderRadius: 5, color: "#807A6F", cursor: "pointer",
      }}>
        <IX size={12} stroke={2} />
      </button>
    </div>
  );
}

function PanelComposer({ placeholder, button, hint }) {
  return (
    <div style={{
      padding: "10px 12px 12px",
      borderTop: "1px solid #E5E0D5",
      background: "#F4F2EC",
      marginTop: 12,
    }}>
      <div style={{
        background: "#FBFAF6",
        border: "1px solid #E5E0D5",
        borderRadius: 9,
        padding: "8px 8px 8px 11px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <input placeholder={placeholder} style={{
          flex: 1, minWidth: 0,
          background: "transparent", border: "none", outline: "none",
          fontSize: 12.5, color: "#1A1814", fontFamily: "inherit",
        }} />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, color: "#B5AEA0", letterSpacing: "0.04em",
        }}>{hint}</span>
        <button style={amberBtn()}>{button}</button>
      </div>
    </div>
  );
}

// ─── Composed scenes for the canvas ─────────────────────────────
function ToolsInContext({ scene }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#0E0E10",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Geist', system-ui, sans-serif",
    }}>
      {/* faux page text — barely visible to imply we're floating over content */}
      <div style={{
        position: "absolute", inset: 0,
        background:
          "radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.04) 0%, transparent 60%)," +
          "radial-gradient(ellipse at 80% 70%, rgba(255,255,255,0.025) 0%, transparent 50%)",
      }} />
      {/* The rail — always present */}
      <div style={{
        position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
      }}>
        <ToolRail active={scene} />
      </div>

      {/* Per-scene UI */}
      {scene === "annotate" && (
        <div style={{ position: "absolute", left: 90, top: 18 }}>
          <AnnotateToolbar />
        </div>
      )}
      {scene === "quote" && (
        <div style={{ position: "absolute", left: 90, top: 24 }}>
          <QuoteAIPanel />
        </div>
      )}
      {scene === "guide" && (
        <div style={{ position: "absolute", left: 90, top: 24 }}>
          <GuidePanel />
        </div>
      )}

      {/* Mode label bottom-right */}
      <div style={{
        position: "absolute", right: 22, bottom: 18,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.4)",
      }}>
        {scene === "annotate" && "Annotate mode"}
        {scene === "quote" && "Quote + AI"}
        {scene === "guide" && "Guide me"}
        {scene === "rail" && "Rail · idle"}
      </div>
    </div>
  );
}

Object.assign(window, {
  ToolRail, AnnotateToolbar, QuoteAIPanel, GuidePanel, ToolsInContext,
});
