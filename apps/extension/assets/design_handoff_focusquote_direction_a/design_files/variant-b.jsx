// ───────── Variant B — Focus Cockpit ─────────
// Big circular timer hero. Quote-of-the-moment treatment. Bolder.

function Dial({ size = 132, progress = 0.4, label = "25:00", caption = "ready" }) {
  const r = (size - 14) / 2;
  const cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      {/* tick marks */}
      <g>
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const long = i % 5 === 0;
          const r1 = r + (long ? 4 : 5.5);
          const r2 = r + (long ? 9 : 8);
          const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1;
          const x2 = cx + Math.cos(a) * r2, y2 = cy + Math.sin(a) * r2;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={long ? "#9A9384" : "#CFC6B2"} strokeWidth={long ? 1.2 : 0.8} strokeLinecap="round" />;
        })}
      </g>
      {/* outer paper ring */}
      <circle cx={cx} cy={cy} r={r} fill="#FBFAF6" stroke="#E5E0D5" strokeWidth="1" />
      {/* progress arc */}
      <circle cx={cx} cy={cy} r={r - 4} fill="none"
        stroke="#F2DCB9" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r - 4} fill="none"
        stroke="url(#dialGrad)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${c * progress} ${c}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <defs>
        <linearGradient id="dialGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4AC4F" />
          <stop offset="100%" stopColor="#C77A1F" />
        </linearGradient>
      </defs>
      {/* center text */}
      <text x={cx} y={cy - 2} textAnchor="middle"
        style={{ font: "500 26px 'JetBrains Mono', monospace", fill: "#1A1814", letterSpacing: "-0.02em" }}>
        {label}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle"
        style={{ font: "500 9px 'JetBrains Mono', monospace", fill: "#807A6F", letterSpacing: "0.18em", textTransform: "uppercase" }}>
        {caption}
      </text>
    </svg>
  );
}

function VariantB_Popup() {
  return (
    <div className="pop">
      {/* HEADER bar — heavier */}
      <div style={{ background: "linear-gradient(180deg, #1F1C16 0%, #2A2620 100%)", color: "#F6F1E3",
        padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--amber)", display: "grid", placeItems: "center", color: "#2A1A05", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 11 }}>FQ</div>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.005em" }}>FocusQuote</span>
        </div>
        <div className="mono" style={{ color: "#A39A85", fontSize: 9.5, display: "flex", alignItems: "center", gap: 10 }}>
          <span><IFlame size={11} stroke={1.8} style={{ color: "var(--amber)", marginRight: 4, verticalAlign: "-2px" }} />14</span>
          <span style={{ color: "#5C5648" }}>·</span>
          <span>8 today</span>
          <button style={{ marginLeft: 4, background: "transparent", border: "none", color: "#A39A85", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <IGear size={14} />
          </button>
        </div>
      </div>

      {/* HERO — dial + intent */}
      <div style={{ padding: "18px 16px 16px", display: "flex", gap: 14, alignItems: "center" }}>
        <Dial size={120} progress={0} label="25:00" caption="ready" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ color: "var(--blue-ink)", fontSize: 9.5, marginBottom: 4 }}>
            <ITarget size={10} stroke={2} style={{ verticalAlign: "-1px", marginRight: 3 }} /> Intent
          </div>
          <div className="serif" style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.25, color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: 8 }}>
            Async architecture patterns in Node.js.
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[15, 25, 45].map(m => (
              <button key={m} style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10.5, fontWeight: m === 25 ? 600 : 500,
                padding: "3px 7px", borderRadius: 5,
                border: "1px solid " + (m === 25 ? "var(--amber)" : "var(--rule-2)"),
                background: m === 25 ? "var(--amber-soft)" : "var(--paper-2)",
                color: m === 25 ? "var(--amber-deep)" : "var(--muted)",
                cursor: "pointer",
              }}>{m}m</button>
            ))}
          </div>
        </div>
      </div>

      {/* big start button */}
      <div style={{ padding: "0 16px 14px" }}>
        <button className="btn-amber" style={{ width: "100%", padding: "12px", fontSize: 13.5 }}>
          <IPlay size={14} /> Begin focus block
        </button>
      </div>

      {/* QUOTE OF THE MOMENT */}
      <div style={{ borderTop: "1px solid var(--rule)", padding: "14px 16px 14px",
        background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="mono">Saved quote · pinned</div>
          <span className="mono" style={{ color: "var(--muted-2)", fontSize: 9.5 }}>1 / 142</span>
        </div>
        <div style={{ position: "relative", paddingLeft: 18 }}>
          <span className="serif" style={{
            position: "absolute", left: -2, top: -10, fontSize: 36, color: "var(--amber)",
            lineHeight: 1, fontStyle: "italic", fontWeight: 500,
          }}>"</span>
          <p className="serif" style={{
            margin: 0, fontSize: 13.5, lineHeight: 1.45, color: "var(--ink-2)",
            fontStyle: "italic", letterSpacing: "-0.005em",
          }}>
            MongoDB is open-source and document-oriented. It uses JSON-like documents with schema — powerful for quick, migration-free development.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <div className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>RIKEN MEHTA · MEDIUM</div>
          <div style={{ display: "flex", gap: 5 }}>
            <button className="btn-ghost" style={{ padding: 6, borderRadius: 6 }}><IArrowL size={12} /></button>
            <button className="btn-ghost" style={{ padding: 6, borderRadius: 6 }}><IArrow size={12} /></button>
          </div>
        </div>
      </div>

      {/* SAVED QUOTES — strip */}
      <div style={{ borderTop: "1px solid var(--rule)", background: "var(--paper-2)", padding: "12px 16px 14px" }}>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <ISearch size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-2)" }} />
          <input className="input" placeholder="Search quotes, tags, sources…" style={{ paddingLeft: 32, background: "var(--paper)", fontSize: 12.5 }} />
        </div>
        <div className="scroll" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
          {[
            { tag: "distributed", title: "Gossip vs. centralized" },
            { tag: "v8", title: "Macro-task ordering" },
            { tag: "node-tar", title: "Hardlink target escape" },
            { tag: "flask", title: "Schema-bound writes" },
          ].map((q, i) => (
            <div key={i} style={{
              flex: "0 0 145px",
              background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 9,
              padding: "9px 10px", cursor: "pointer",
            }}>
              <div className="chip" style={{ marginBottom: 6, fontSize: 9.5 }}>{q.tag}</div>
              <div className="serif" style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, color: "var(--ink)" }}>{q.title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VariantB_Settings() {
  return (
    <div className="pop">
      {/* dark header matches popup */}
      <div style={{ background: "linear-gradient(180deg, #1F1C16 0%, #2A2620 100%)", color: "#F6F1E3",
        padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button style={{ background: "transparent", border: "none", color: "#F6F1E3", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: 500, padding: 0 }}>
          <IArrowL size={13} /> Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Settings</span>
        <span style={{ width: 50 }} />
      </div>

      {/* TABS */}
      <div style={{ display: "flex", padding: "10px 12px", gap: 4, borderBottom: "1px solid var(--rule)", background: "var(--paper-2)" }}>
        {[
          { k: "acct", l: "Account", I: IUser, active: true },
          { k: "sess", l: "Session", I: ITimer },
          { k: "ai",   l: "AI",      I: IBolt },
          { k: "priv", l: "Privacy", I: ITarget },
        ].map(t => (
          <button key={t.k} style={{
            flex: 1, padding: "6px 6px", border: "none", cursor: "pointer",
            background: t.active ? "var(--paper)" : "transparent",
            borderRadius: 7,
            border: t.active ? "1px solid var(--rule-2)" : "1px solid transparent",
            color: t.active ? "var(--ink)" : "var(--muted)",
            fontSize: 11, fontWeight: t.active ? 600 : 500,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <t.I size={12} /> {t.l}
          </button>
        ))}
      </div>

      <div style={{ padding: "14px 16px 16px" }}>
        {/* avatar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 999, background: "linear-gradient(135deg, var(--amber-soft) 0%, var(--clay-soft) 100%)",
            display: "grid", placeItems: "center", color: "var(--amber-deep)",
            fontWeight: 700, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
            border: "1px solid var(--amber)",
          }}>TB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Tomas Brasca</div>
            <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>tomibrasca97@gmail.com</div>
          </div>
          <span className="chip" style={{ background: "var(--sage-soft)", color: "var(--sage-ink)", border: "1px solid #C6D7C2" }}>
            <IDot size={8} style={{ color: "var(--sage-ink)" }} /> synced
          </span>
        </div>

        {/* DISPLAY NAME */}
        <div className="mono" style={{ marginBottom: 6 }}>Display name</div>
        <input className="input" defaultValue="Tomas Brasca" style={{ marginBottom: 12 }} />

        {/* HEADLINE */}
        <div className="mono" style={{ marginBottom: 6 }}>Headline</div>
        <input className="input" defaultValue="Builder · async patterns · Node" style={{ marginBottom: 5 }} />
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 14 }}>
          Stored on this device + linked to your account.
        </div>

        {/* APPEARANCE */}
        <div className="mono" style={{ marginBottom: 6 }}>Appearance</div>
        <div style={{ display: "flex", gap: 0, marginBottom: 14,
          border: "1px solid var(--rule-2)", borderRadius: 8, overflow: "hidden", background: "var(--paper-2)" }}>
          {[
            { k: "light", l: "Light", I: ISun, active: true },
            { k: "dark",  l: "Dark",  I: IMoon },
            { k: "auto",  l: "Auto",  I: IDot },
          ].map((o, i) => (
            <button key={o.k} style={{
              flex: 1, flexBasis: 0, minWidth: 0, padding: "9px 8px",
              borderRight: i < 2 ? "1px solid var(--rule)" : "none",
              background: o.active ? "var(--paper)" : "transparent",
              border: "none", borderRadius: 0,
              color: o.active ? "var(--ink)" : "var(--muted)",
              fontSize: 12, fontWeight: o.active ? 600 : 500, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              boxShadow: o.active ? "0 1px 3px rgba(40,30,15,0.07)" : "none",
            }}>
              <o.I size={13} /> {o.l}
            </button>
          ))}
        </div>

        {/* DANGER footer */}
        <div className="rule-dashed" style={{ marginBottom: 12 }} />
        <button className="btn-ghost" style={{
          width: "100%", justifyContent: "center", padding: "10px",
          color: "var(--clay-ink)", borderColor: "#E8C7B7",
        }}>
          <ILogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { VariantB_Popup, VariantB_Settings, Dial });
