// Lay all three variants onto a design canvas
const { DesignCanvas, DCSection, DCArtboard } = window;

function Frame({ children, h = 720, w = 380 }) {
  return (
    <div style={{
      width: w, height: h, padding: 0,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      background: "transparent",
    }}>
      {children}
    </div>
  );
}

function Caption({ kicker, title, blurb }) {
  return (
    <div style={{
      maxWidth: 520, padding: "0 0 18px",
      fontFamily: "'Geist', system-ui, sans-serif", color: "#1A1814",
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        textTransform: "uppercase", letterSpacing: "0.12em",
        color: "#C77A1F", marginBottom: 6,
      }}>{kicker}</div>
      <div className="serif" style={{
        fontFamily: "'Newsreader', Georgia, serif",
        fontSize: 28, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.1,
        marginBottom: 6,
      }}>{title}</div>
      <div style={{ fontSize: 13.5, color: "#6B6760", lineHeight: 1.5, maxWidth: 440 }}>
        {blurb}
      </div>
    </div>
  );
}

function App() {
  return (
    <DesignCanvas title="FocusQuote popup — three directions"
            subtitle="Click an artboard's ⤢ to focus fullscreen. Each direction shows popup + settings.">

      <DCSection id="intro" title="Visual system">
        <DCArtboard id="intro-card" label="Tokens & rationale" width={820} height={460}>
          <div style={{
            padding: 32, height: "100%", boxSizing: "border-box",
            background: "#FBFAF6", color: "#1A1814",
            fontFamily: "'Geist', system-ui, sans-serif",
            display: "flex", flexDirection: "column", gap: 18,
          }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#807A6F", marginBottom: 6 }}>
                FocusQuote · popup system
              </div>
              <div className="serif" style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 34, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.05 }}>
                Editorial-utility, in a 380px window.
              </div>
            </div>

            {/* Tokens row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 16 }}>
              {/* Type */}
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#807A6F", marginBottom: 8 }}>Type</div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontFamily: "'Newsreader', serif", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Newsreader — display</div>
                  <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 14 }}>Geist — interface body</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.04em" }}>JetBrains Mono — labels & ids</div>
                </div>
              </div>

              {/* Palette */}
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#807A6F", marginBottom: 8 }}>Palette</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                  {[
                    { c: "#FBFAF6", l: "Paper" },
                    { c: "#F4F2EC", l: "Paper-2" },
                    { c: "#1A1814", l: "Ink" },
                    { c: "#F2A03C", l: "Amber" },
                    { c: "#C77A1F", l: "Amber-d" },
                  ].map(s => (
                    <div key={s.l}>
                      <div style={{ height: 36, background: s.c, borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)" }} />
                      <div style={{ fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", color: "#807A6F", marginTop: 4, letterSpacing: "0.04em" }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>
                  {[
                    { c: "#E0EBF1", l: "Blue-soft" },
                    { c: "#E1EBDF", l: "Sage-soft" },
                    { c: "#F2DDD3", l: "Clay-soft" },
                  ].map(s => (
                    <div key={s.l}>
                      <div style={{ height: 26, background: s.c, borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)" }} />
                      <div style={{ fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", color: "#807A6F", marginTop: 4, letterSpacing: "0.04em" }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Principles */}
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#807A6F", marginBottom: 8 }}>Principles</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6, fontSize: 12.5, lineHeight: 1.45, color: "#3A362F" }}>
                  <li>· Mono small-caps for labels, ids, meta</li>
                  <li>· Serif moments for serif moments — names, headings, the quote</li>
                  <li>· Single amber action — never more than one per screen</li>
                  <li>· Soft tinted callouts for status; no saturated chrome</li>
                  <li>· Hairline rules over heavy borders; paper layering for depth</li>
                </ul>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#807A6F", borderTop: "1px dashed #D9D3C5", paddingTop: 10 }}>
              Three popup directions follow — same content & flows, different visual rhythm.
            </div>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="a" title="Direction A — Editorial Column">
        <DCArtboard id="a-pop" label="A · Popup" width={420} height={840}>
          <Frame h={820}><VariantA_Popup /></Frame>
        </DCArtboard>
        <DCArtboard id="a-set" label="A · Settings" width={420} height={840}>
          <Frame h={820}><VariantA_Settings /></Frame>
        </DCArtboard>
        <DCArtboard id="a-notes" label="A · Rationale" width={360} height={840}>
          <div style={{ padding: 24, height: "100%", boxSizing: "border-box", background: "#FBFAF6",
            fontFamily: "'Geist', system-ui, sans-serif", color: "#1A1814" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#C77A1F", marginBottom: 8 }}>Direction A</div>
            <div className="serif" style={{ fontFamily: "'Newsreader', serif", fontSize: 24, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.015em", marginBottom: 12 }}>
              Editorial Column
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "#3A362F", margin: "0 0 12px" }}>
              Cleanest dashboard match. Today's intent gets a tinted band at the top — same as your overview page — then a short, action-forward focus block, then quote cards stacked in a paper drawer.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#6B6760", margin: "0 0 16px" }}>
              Use when consistency with the web app matters most. Reads as a miniature dashboard rather than a different surface.
            </p>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#807A6F", marginBottom: 6 }}>Best for</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4, fontSize: 12, color: "#3A362F" }}>
              <li>· Users primarily reading + saving</li>
              <li>· Sessions ≥ 25 min, slower cadence</li>
              <li>· Surface-area parity with web app</li>
            </ul>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="a-selection" title="Direction A — Selection toolbar">
        <DCArtboard id="a-sel-context" label="A · Selection · in context" width={720} height={520}>
          <SelectionInContext state="default" />
        </DCArtboard>
        <DCArtboard id="a-sel-saved" label="A · Selection · saved state" width={720} height={520}>
          <SelectionInContext state="saved" />
        </DCArtboard>
        <DCArtboard id="a-sel-expanded" label="A · Selection · language menu" width={720} height={520}>
          <SelectionInContext state="expanded" />
        </DCArtboard>
        <DCArtboard id="a-sel-anatomy" label="A · Selection · anatomy" width={720} height={520}>
          <SelectionAnatomy />
        </DCArtboard>
      </DCSection>

      <DCSection id="b" title="Direction B — Focus Cockpit">
        <DCArtboard id="b-pop" label="B · Popup" width={420} height={840}>
          <Frame h={820}><VariantB_Popup /></Frame>
        </DCArtboard>
        <DCArtboard id="b-set" label="B · Settings" width={420} height={840}>
          <Frame h={820}><VariantB_Settings /></Frame>
        </DCArtboard>
        <DCArtboard id="b-notes" label="B · Rationale" width={360} height={840}>
          <div style={{ padding: 24, height: "100%", boxSizing: "border-box", background: "#FBFAF6",
            fontFamily: "'Geist', system-ui, sans-serif", color: "#1A1814" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#C77A1F", marginBottom: 8 }}>Direction B</div>
            <div className="serif" style={{ fontFamily: "'Newsreader', serif", fontSize: 24, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.015em", marginBottom: 12 }}>
              Focus Cockpit
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "#3A362F", margin: "0 0 12px" }}>
              The dial is the hero — when the popup opens, the user is one click from focus. A dark masthead anchors the identity; the saved quote gets a real "moment of stillness" with a big italic pull-quote treatment.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#6B6760", margin: "0 0 16px" }}>
              Use when the timer is the primary action and the popup is opened during work, not just to browse the vault.
            </p>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#807A6F", marginBottom: 6 }}>Best for</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4, fontSize: 12, color: "#3A362F" }}>
              <li>· Power users who start ≥ 3 sessions / day</li>
              <li>· Quote-as-ritual: one quote, savoured</li>
              <li>· A stronger product personality</li>
            </ul>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="c" title="Direction C — Index Rail">
        <DCArtboard id="c-pop" label="C · Popup" width={420} height={840}>
          <Frame h={820}><VariantC_Popup /></Frame>
        </DCArtboard>
        <DCArtboard id="c-set" label="C · Settings" width={420} height={920}>
          <Frame h={900}><VariantC_Settings /></Frame>
        </DCArtboard>
        <DCArtboard id="c-notes" label="C · Rationale" width={360} height={840}>
          <div style={{ padding: 24, height: "100%", boxSizing: "border-box", background: "#FBFAF6",
            fontFamily: "'Geist', system-ui, sans-serif", color: "#1A1814" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#C77A1F", marginBottom: 8 }}>Direction C</div>
            <div className="serif" style={{ fontFamily: "'Newsreader', serif", fontSize: 24, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.015em", marginBottom: 12 }}>
              Index Rail
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "#3A362F", margin: "0 0 12px" }}>
              Densest of the three. A vertical rail numbers each region (01 Focus, 02 Intent, 03 Vault) so the small viewport reads as a clearly-ordered worksheet. Stats live in a horizontal trio, quotes are indexed by ID.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#6B6760", margin: "0 0 16px" }}>
              Use when the user wants information density and treats their vault as a real archive — closer to a research notebook than a wellness app.
            </p>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#807A6F", marginBottom: 6 }}>Best for</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4, fontSize: 12, color: "#3A362F" }}>
              <li>· Heavy archivers (200+ quotes)</li>
              <li>· Keyboard / shortcut users</li>
              <li>· Tooling-first product positioning</li>
            </ul>
          </div>
        </DCArtboard>
      </DCSection>

    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
