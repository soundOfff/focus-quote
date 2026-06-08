// ───────── Variant A — Editorial Column ─────────
// Generous warm paper, serif moments, mono labels. Strong dashboard match.

const sampleQuotesA = [
  {
    tag: "node-tar",
    title: "Arbitrary File Read/Write via Hardlink Target",
    snippet: "Symlink chain in node-tar extraction allows arbitrary write outside the extraction directory.",
    source: "GitHub Security Advisory",
    when: "2h",
  },
  {
    tag: "flask + mongo",
    title: "Setting up document validation",
    snippet: "In this Part II tutorial we'll update the basic Flask server from Part I with schema-bound writes.",
    source: "Riken Mehta · Medium",
    when: "yest",
  },
  {
    tag: "v8 internals",
    title: "Macro-task queue ordering",
    snippet: "The event loop drains microtasks before yielding to the next macro task — render flush sits in between.",
    source: "Lin Clark · Mozilla Hacks",
    when: "Tue",
  },
];

function VariantA_Popup() {
  return (
    <div className="pop" style={{ padding: 0 }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 12px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="serif" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Focus<span style={{ color: "var(--amber-deep)" }}>Quote</span></span>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>FRI · MAY 15</span>
        </div>
        <button className="btn-ghost" style={{ padding: 6, borderRadius: 7 }}>
          <IGear size={14} />
        </button>
      </div>

      {/* TODAY'S INTENT */}
      <div style={{ padding: "12px 16px 6px", background: "var(--paper-2)", borderBottom: "1px solid var(--rule)" }}>
        <div className="mono" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--blue-ink)", marginBottom: 4 }}>
          <ITarget size={11} stroke={2} /> Today's intent
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)", lineHeight: 1.4, marginBottom: 8 }}>
          Consolidating async architecture patterns in Node.js.
        </div>
      </div>

      {/* FOCUS SESSION */}
      <div style={{ padding: "14px 16px 16px" }}>
        <div className="mono" style={{ marginBottom: 8 }}>Focus session</div>
        <input className="input" placeholder="What are you focusing on?" style={{ marginBottom: 10 }} />

        <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
          {/* duration segmented */}
          <div style={{ display: "flex", border: "1px solid var(--rule-2)", borderRadius: 8, overflow: "hidden", background: "var(--paper-2)" }}>
            {[15, 25, 45].map((m, i) => (
              <button key={m} style={{
                background: m === 25 ? "var(--paper)" : "transparent",
                border: "none",
                borderRight: i < 2 ? "1px solid var(--rule)" : "none",
                padding: "0 11px",
                fontSize: 12, fontWeight: m === 25 ? 600 : 500,
                color: m === 25 ? "var(--ink)" : "var(--muted)",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: m === 25 ? "0 1px 2px rgba(40,30,15,0.08)" : "none",
              }}>{m}</button>
            ))}
          </div>
          <button className="btn-amber" style={{ flex: 1 }}>
            <IPlay size={13} /> Start 25-min session
          </button>
        </div>

        {/* live row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 11.5, color: "var(--muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <IFlame size={12} stroke={1.8} style={{ color: "var(--amber-deep)" }} />
            <b style={{ color: "var(--ink-2)", fontWeight: 600 }}>14</b> day streak
          </span>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--muted-2)" }} />
          <span><b style={{ color: "var(--ink-2)", fontWeight: 600 }}>8</b> today</span>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--muted-2)" }} />
          <span><b style={{ color: "var(--ink-2)", fontWeight: 600 }}>142</b> quotes</span>
        </div>
      </div>

      {/* SAVED QUOTES */}
      <div style={{ borderTop: "1px solid var(--rule)", background: "var(--paper-2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 8px" }}>
          <div className="mono">Saved quotes <span style={{ color: "var(--muted-2)" }}>· 142</span></div>
          <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--blue-ink)", fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 3 }}>
            All <IChevR size={11} />
          </button>
        </div>
        <div style={{ padding: "0 12px 4px" }}>
          <div style={{ position: "relative" }}>
            <ISearch size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-2)" }} />
            <input className="input" placeholder="Search quotes or tags…" style={{ paddingLeft: 32, background: "var(--paper)", fontSize: 12.5 }} />
          </div>
        </div>

        <div className="scroll" style={{ maxHeight: 260, overflowY: "auto", padding: "8px 12px 12px" }}>
          {sampleQuotesA.map((q, i) => (
            <article key={i} style={{
              background: "var(--paper)", borderRadius: 10,
              border: "1px solid var(--rule)",
              padding: "11px 12px 11px",
              marginBottom: 7,
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span className="chip">{q.tag}</span>
                <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>{q.when}</span>
              </div>
              <div className="serif" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: "var(--ink)", marginBottom: 4, letterSpacing: "-0.005em" }}>
                {q.title}
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {q.snippet}
              </div>
              <div className="mono" style={{ marginTop: 7, fontSize: 9.5, color: "var(--muted-2)" }}>
                — {q.source}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function VariantA_Settings() {
  return (
    <div className="pop">
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 12px", borderBottom: "1px solid var(--rule)" }}>
        <button className="btn-ghost" style={{ padding: "5px 8px", border: "none", background: "transparent", color: "var(--muted)" }}>
          <IArrowL size={13} /> Back
        </button>
        <span className="serif" style={{ fontSize: 14, fontWeight: 600 }}>Settings</span>
        <span style={{ width: 38 }} />
      </div>

      <div style={{ padding: "14px 16px 16px" }}>
        {/* account card */}
        <div className="mono" style={{ marginBottom: 8 }}>Account</div>
        <div style={{
          background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 10,
          padding: 10, display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 999, background: "var(--amber-soft)",
            display: "grid", placeItems: "center", color: "var(--amber-deep)",
            fontWeight: 700, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            border: "1px solid var(--amber)",
          }}>TB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Tomas Brasca</div>
            <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>tomibrasca97@gmail.com</div>
          </div>
          <button className="btn-ghost" style={{ fontSize: 11, padding: "6px 9px" }}><ILogOut size={12} /> Sign out</button>
        </div>

        {/* Appearance */}
        <div className="mono" style={{ marginBottom: 8 }}>Appearance</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[
            { k: "light", l: "Light", I: ISun, active: true },
            { k: "dark", l: "Dark", I: IMoon },
            { k: "auto", l: "Auto", I: IDot },
          ].map(o => (
            <button key={o.k} style={{
              flex: 1, flexBasis: 0, minWidth: 0, padding: "9px 8px",
              borderRadius: 8,
              border: o.active ? "1px solid var(--amber)" : "1px solid var(--rule-2)",
              background: o.active ? "var(--amber-soft)" : "var(--paper-2)",
              color: o.active ? "var(--amber-deep)" : "var(--ink-2)",
              fontSize: 12, fontWeight: o.active ? 600 : 500, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <o.I size={13} /> {o.l}
            </button>
          ))}
        </div>

        {/* Session defaults */}
        <div className="mono" style={{ marginBottom: 8 }}>Session defaults</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { l: "Focus", v: 25, u: "min" },
            { l: "Break", v: 5, u: "min" },
          ].map(f => (
            <div key={f.l} style={{
              background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 10,
              padding: "8px 10px",
            }}>
              <div className="mono" style={{ fontSize: 9.5, marginBottom: 4 }}>{f.l}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid var(--rule-2)", background: "var(--paper)", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted)" }}><IMinus size={11} /></button>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 500 }}>
                  {f.v}<span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 2 }}>{f.u}</span>
                </div>
                <button style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid var(--rule-2)", background: "var(--paper)", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted)" }}><IPlus size={11} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Translate */}
        <div className="mono" style={{ marginBottom: 8 }}>Translation</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { l: "From", v: "English" },
            { l: "To", v: "Spanish" },
          ].map(f => (
            <div key={f.l} style={{
              background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 10,
              padding: "7px 11px",
            }}>
              <div className="mono" style={{ fontSize: 9.5, marginBottom: 1 }}>{f.l}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, fontWeight: 500 }}>
                {f.v} <IChevR size={11} style={{ color: "var(--muted)" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Storage */}
        <div className="mono" style={{ marginBottom: 8 }}>Storage</div>
        <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 10, padding: "10px 11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Local cache</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>4.2 / 50 MB</span>
          </div>
          <div style={{ height: 5, background: "var(--paper)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--rule)" }}>
            <div style={{ width: "8.4%", height: "100%", background: "linear-gradient(90deg, var(--amber) 0%, var(--amber-deep) 100%)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VariantA_Popup, VariantA_Settings });
