// ───────── Variant C — Index Rail ─────────
// Dense utility. Numbered rail. Mono-forward index treatment.

function VariantC_Popup() {
  return (
    <div className="pop" style={{ paddingBottom: 0 }}>
      {/* TOP RIBBON — index header with rule + ID */}
      <div style={{
        padding: "12px 16px 10px",
        borderBottom: "1px solid var(--rule)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>№</span>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>FQ — 0521</span>
          <span style={{ width: 1, height: 11, background: "var(--rule-2)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>FocusQuote</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>17:42</span>
          <button className="btn-ghost" style={{ padding: 5, borderRadius: 6, border: "none", background: "transparent", color: "var(--muted)" }}>
            <IGear size={14} />
          </button>
        </div>
      </div>

      {/* STATS ROW — three columns w/ verticals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--rule)" }}>
        {[
          { l: "Sessions", v: "08", sub: "today" },
          { l: "Streak",   v: "14", sub: "days" },
          { l: "Vault",    v: "142", sub: "quotes" },
        ].map((s, i) => (
          <div key={s.l} style={{
            padding: "12px 14px",
            borderRight: i < 2 ? "1px solid var(--rule)" : "none",
            position: "relative",
          }}>
            <div className="mono" style={{ fontSize: 9.5, marginBottom: 6, color: "var(--muted)" }}>{s.l}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>{s.v}</span>
              <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* FOCUS SECTION with rail */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--rule)" }}>
        {/* rail */}
        <div style={{
          width: 42, padding: "14px 0 14px",
          borderRight: "1px solid var(--rule)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          background: "var(--paper-2)",
        }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--muted-2)", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.18em" }}>01 · FOCUS</span>
        </div>
        {/* body */}
        <div style={{ flex: 1, padding: "12px 16px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="serif" style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>New focus block</div>
            <div className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>25:00 default</div>
          </div>

          <input className="input" placeholder="Goal for this session…" style={{ marginBottom: 8 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* duration stepper */}
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--rule-2)", borderRadius: 7, overflow: "hidden", background: "var(--paper-2)" }}>
              <button style={{ width: 26, height: 30, border: "none", borderRight: "1px solid var(--rule)", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "grid", placeItems: "center" }}><IMinus size={11} /></button>
              <div style={{ width: 36, textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600 }}>25</div>
              <button style={{ width: 26, height: 30, border: "none", borderLeft: "1px solid var(--rule)", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "grid", placeItems: "center" }}><IPlus size={11} /></button>
            </div>
            <button className="btn-amber" style={{ flex: 1, height: 32 }}>
              <IPlay size={12} /> Start
            </button>
          </div>
        </div>
      </div>

      {/* INTENT */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--rule)" }}>
        <div style={{
          width: 42, padding: "14px 0", borderRight: "1px solid var(--rule)",
          background: "var(--paper-2)",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--muted-2)", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.18em" }}>02 · INTENT</span>
        </div>
        <div style={{ flex: 1, padding: "12px 16px" }}>
          <div className="serif" style={{ fontSize: 13.5, lineHeight: 1.35, fontStyle: "italic", color: "var(--ink-2)", letterSpacing: "-0.005em" }}>
            Consolidating async architecture patterns in Node.js.
          </div>
          <button style={{
            marginTop: 6, background: "transparent", border: "none", padding: 0,
            color: "var(--blue-ink)", fontSize: 11, fontWeight: 500, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <IPen size={11} /> Edit intent
          </button>
        </div>
      </div>

      {/* VAULT */}
      <div style={{ display: "flex", background: "var(--paper-2)" }}>
        <div style={{
          width: 42, padding: "14px 0",
          borderRight: "1px solid var(--rule)",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--muted-2)", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.18em" }}>03 · VAULT</span>
        </div>
        <div style={{ flex: 1, padding: "12px 14px 14px", minWidth: 0 }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <ISearch size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-2)" }} />
            <input className="input" placeholder="Filter 142 quotes…" style={{ paddingLeft: 30, background: "var(--paper)", fontSize: 12 }} />
          </div>

          {/* indexed quote list */}
          <div className="scroll" style={{ maxHeight: 220, overflowY: "auto", marginRight: -4, paddingRight: 4 }}>
            {[
              { idx: "142", tag: "node-tar", title: "Hardlink target escape", src: "GHSA · 2h" },
              { idx: "141", tag: "flask",    title: "Schema-bound writes",   src: "R. Mehta · y" },
              { idx: "140", tag: "v8",       title: "Macro-task ordering",   src: "MDN · Tue" },
              { idx: "139", tag: "rust",     title: "Borrow checker myths",  src: "F. Cantor · Mon" },
            ].map((q, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "28px 1fr auto",
                gap: 8, alignItems: "center",
                padding: "8px 0",
                borderBottom: i < 3 ? "1px dashed var(--rule-2)" : "none",
                cursor: "pointer",
              }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>{q.idx}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.title}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 1 }}>{q.tag} · {q.src}</div>
                </div>
                <IChevR size={12} style={{ color: "var(--muted-2)" }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 16px", borderTop: "1px solid var(--rule)", background: "var(--paper)" }}>
        <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>SYNC · OK</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--sage-ink)" }} />
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>READY</span>
        </span>
      </div>
    </div>
  );
}

function VariantC_Settings() {
  return (
    <div className="pop">
      {/* HEADER */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--rule)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500 }}>
          <IArrowL size={13} /> Back
        </button>
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>SETTINGS · OPTIONS</span>
        <span style={{ width: 40 }} />
      </div>

      {/* sectioned content w/ rail */}
      {[
        {
          n: "01", k: "ACCOUNT",
          body: (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--amber-soft)", display: "grid", placeItems: "center", color: "var(--amber-deep)", fontWeight: 700, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", border: "1px solid var(--amber)" }}>TB</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>Tomas Brasca</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>tomibrasca97@gmail.com</div>
                </div>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "5px 8px", color: "var(--clay-ink)", borderColor: "#E8C7B7" }}>
                  <ILogOut size={11} />
                </button>
              </div>
              <div className="mono" style={{ fontSize: 9, marginBottom: 4 }}>Display name</div>
              <input className="input" defaultValue="Tomas Brasca" style={{ fontSize: 12, padding: "7px 9px" }} />
            </div>
          )
        },
        {
          n: "02", k: "SESSION",
          body: (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                {[
                  { l: "Focus", v: 25 },
                  { l: "Break", v: 5 },
                ].map(f => (
                  <div key={f.l} style={{ border: "1px solid var(--rule-2)", borderRadius: 7, padding: "7px 9px", background: "var(--paper)" }}>
                    <div className="mono" style={{ fontSize: 9, marginBottom: 4 }}>{f.l} · min</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <button style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid var(--rule-2)", background: "var(--paper-2)", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted)" }}><IMinus size={10} /></button>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 500 }}>{f.v}</div>
                      <button style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid var(--rule-2)", background: "var(--paper-2)", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted)" }}><IPlus size={10} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 0", fontSize: 12 }}>
                <span style={{ color: "var(--ink-2)" }}>Auto-start break</span>
                <Toggle on />
              </div>
            </div>
          )
        },
        {
          n: "03", k: "PRIVACY",
          body: (
            <div>
              {[
                { t: "Track URLs visited", s: "Required for AI summaries.", on: true },
                { t: "Share anonymous usage", s: "Help improve FocusQuote.", on: false },
              ].map(p => (
                <div key={p.t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px dashed var(--rule-2)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{p.t}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>{p.s}</div>
                  </div>
                  <Toggle on={p.on} />
                </div>
              ))}
            </div>
          )
        },
        {
          n: "04", k: "STORAGE",
          body: (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>Local cache</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>4.2 / 50 MB</span>
              </div>
              <div style={{ height: 4, background: "var(--paper-2)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--rule)", marginBottom: 8 }}>
                <div style={{ width: "8.4%", height: "100%", background: "var(--amber)" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-ghost" style={{ flex: 1, fontSize: 11, padding: "6px 8px", justifyContent: "center" }}>Export JSON</button>
                <button className="btn-ghost" style={{ flex: 1, fontSize: 11, padding: "6px 8px", justifyContent: "center", color: "var(--clay-ink)", borderColor: "#E8C7B7" }}>Clear cache</button>
              </div>
            </div>
          )
        },
      ].map(sec => (
        <div key={sec.n} style={{ display: "flex", borderBottom: "1px solid var(--rule)" }}>
          <div style={{
            width: 42, padding: "12px 0",
            borderRight: "1px solid var(--rule)",
            background: "var(--paper-2)",
            display: "flex", flexDirection: "column", alignItems: "center",
          }}>
            <span className="mono" style={{ fontSize: 9, color: "var(--muted-2)", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.18em" }}>
              {sec.n} · {sec.k}
            </span>
          </div>
          <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
            {sec.body}
          </div>
        </div>
      ))}

      {/* footer */}
      <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>v 0.4.1 · Local-first</span>
        <span className="mono" style={{ fontSize: 9.5, color: "var(--sage-ink)" }}>● Synced</span>
      </div>
    </div>
  );
}

function Toggle({ on }) {
  return (
    <span style={{
      width: 30, height: 17, borderRadius: 999, position: "relative",
      background: on ? "var(--amber)" : "var(--rule-2)",
      border: "1px solid " + (on ? "var(--amber-deep)" : "var(--rule-2)"),
      transition: "background 120ms",
      flexShrink: 0,
    }}>
      <span style={{
        position: "absolute", top: 1, left: on ? 14 : 1,
        width: 13, height: 13, borderRadius: 999,
        background: "#fff",
        boxShadow: "0 1px 2px rgba(40,30,15,0.2)",
        transition: "left 120ms",
      }} />
    </span>
  );
}

Object.assign(window, { VariantC_Popup, VariantC_Settings, Toggle });
