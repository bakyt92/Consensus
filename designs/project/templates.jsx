// templates.jsx — meeting-template catalog, mock data, and 5 center-pane visualizations.
//
// Each template owns:
//   • metadata (name, tagline, icon)
//   • a label set used by the room's chat chips and the participant inspector
//   • a Visualization component that renders the room's center pane
//   • template-specific mock data so each viz looks populated immediately
//
// All 5 share the same outer frame — only the body of the card differs.

const { useMemo } = React;

// ============================================================
// LABEL + SENTIMENT BASE STYLES
// ============================================================
// Per the spec we use a single hue tweak (not three new colours):
//   positive = navy, negative = rust, neutral = muted.
// ============================================================
const SENTIMENT = {
  positive: { dot: 'var(--navy)',  name: 'positive' },
  negative: { dot: 'var(--rust)',  name: 'negative' },
  neutral:  { dot: 'var(--muted)', name: 'neutral'  },
};

// Re-usable chip component used both inline under chat bubbles and in the
// inspector recent-messages list. Subdued — labels are reference, not headline.
function LabelChip({ label, sentiment, dark = false }) {
  if (!label) return null;
  const s = SENTIMENT[sentiment] || SENTIMENT.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 8px',
        borderRadius: 3,
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase',
        background: dark ? 'rgba(243,236,217,0.1)' : 'var(--cream-2)',
        color: dark ? 'rgba(243,236,217,0.75)' : 'var(--muted)',
        border: dark ? '1px solid rgba(243,236,217,0.15)' : '1px solid var(--line)',
      }}
    >
      {label}
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, opacity: dark ? 0.85 : 1 }}></span>
    </span>
  );
}

// ============================================================
// MOCK CONTENT — one bundle per template.
// Drawn from realistic but distinct meetings so each viz reads at a glance.
// ============================================================

// ---------- Debate ----------
const DEBATE_MOCK = {
  topic: 'Four-day work week — adopt for the engineering org',
  proposition: 'We should pilot a four-day work week for engineering, starting Q1, with no salary change.',
  pro: [
    { id: 'p1', who: 'Maya',   text: 'Reduced burnout in three peer companies that piloted it; retention up 18%.', strength: 3 },
    { id: 'p2', who: 'Jordan', text: 'Focus time goes up when meetings are forced to compact — fewer status meetings, more deep work.', strength: 2 },
    { id: 'p3', who: 'Sam',    text: 'Strong recruiting signal in a tight market. Two finalists last quarter cited it.', strength: 2 },
  ],
  con: [
    { id: 'c1', who: 'Priya',  text: 'Client SLAs span five days. We\'d need to stagger off-days, which fragments the team.', strength: 3 },
    { id: 'c2', who: 'Jordan', text: 'On-call rotations get harder — fewer bodies on any given day.', strength: 2 },
    { id: 'c3', who: 'Sam',    text: 'No data yet on what this does to senior-IC mentorship time. Risk of widening the gap.', strength: 1 },
  ],
  questions: [
    { id: 'q1', who: 'Maya',  text: 'What does the trial duration look like — one quarter or two?' },
    { id: 'q2', who: 'Priya', text: 'How do we measure success? Throughput, satisfaction, both?' },
  ],
};

// ---------- Brainstorm ----------
const BRAINSTORM_MOCK = {
  root: 'How might we reduce total meeting time by 30%?',
  ideas: [
    { id: 'b1', who: 'Jordan', text: 'Async-by-default for daily status — Slack thread instead of standup.',  builds: 12, sentiment: 'positive' },
    { id: 'b2', who: 'Priya',  text: 'Default meeting length to 25 minutes (Google Calendar override).',       builds: 8,  sentiment: 'positive' },
    { id: 'b3', who: 'Maya',   text: 'Kill all standing recurring meetings; re-add only by request.',           builds: 10, sentiment: 'positive' },
    { id: 'b4', who: 'Sam',    text: 'Hard cap of 5 attendees; anything bigger requires a written brief first.',builds: 5,  sentiment: 'neutral'  },
    { id: 'b5', who: 'Jordan', text: 'No-meeting Wednesdays company-wide.',                                     builds: 3,  sentiment: 'neutral'  },
    { id: 'b6', who: 'Priya',  text: 'Walking meetings for any 1:1 under 30 minutes.',                          builds: 2,  sentiment: 'neutral'  },
    { id: 'b7', who: 'Sam',    text: 'Decision logs auto-posted to the room channel after every meeting.',     builds: 4,  sentiment: 'positive' },
  ],
};

// ---------- Stand-up ----------
const STANDUP_MOCK = {
  rows: [
    {
      who: 'Maya',
      yesterday: ['Wrote the H1 OKR draft — three rounds of edits.', 'Two interviews for the Staff role.'],
      today:     ['Finalise OKR doc with leadership.', 'Sync with design on v3 spec.'],
      blockers:  [],
    },
    {
      who: 'Jordan',
      yesterday: ['Shipped the rate-limit refactor.', 'Reviewed Priya\'s PR.'],
      today:     ['Onboard new EM.', 'Capacity planning for Q2.'],
      blockers:  [{ text: 'Need access to the metrics dataset — pinged Sam.', help: true }],
    },
    {
      who: 'Priya',
      yesterday: ['Fixed the SSO bug.', 'Started indexer rewrite.'],
      today:     ['Continue indexer — aiming for staging by EOD.'],
      blockers:  [],
    },
    {
      who: 'Sam',
      yesterday: ['Wrote the postmortem for the Friday incident.'],
      today:     ['Postmortem review meeting.', 'Grant Jordan dataset access (TODO).'],
      blockers:  [{ text: 'Waiting on legal sign-off for the data residency change.', help: false }],
    },
  ],
};

// ---------- Retrospective ----------
const RETRO_MOCK = {
  wentWell: [
    { who: 'Maya',   text: 'Shipped v3 redesign on schedule — three quarters of "next month" finally landed.' },
    { who: 'Sam',    text: 'On-call burden dropped 40% after the alerting cleanup.' },
    { who: 'Priya',  text: 'Hired two senior ICs; both started this sprint.' },
  ],
  wentPoorly: [
    { who: 'Jordan', text: 'Mobile launch slipped two weeks — undersized the testing matrix.' },
    { who: 'Priya',  text: 'Friday incident — five-hour outage, root cause was a flag flip with no rollback.' },
  ],
  actions: [
    { text: 'Add a rollback drill to every flag rollout.',   owner: 'Sam'    },
    { text: 'Pre-write incident runbooks for top-5 risks.',  owner: 'Priya'  },
    { text: 'Size testing matrix at planning, not at launch.', owner: 'Jordan' },
  ],
  kudos: [
    { from: 'Maya', to: 'Sam',    text: 'Took the postmortem facilitation seriously — set a new bar.' },
    { from: 'Sam',  to: 'Priya',  text: 'Stayed up to triage the outage. Got us back online.' },
  ],
};

// ---------- Negotiation / Mediation ----------
// This one mirrors the actual scripted flow in room.jsx — same agenda,
// same four parties, same agreement structure.
const NEGOTIATION_MOCK = {
  parties: [
    {
      who: 'Maya',
      role: 'Facilitator · Eng Lead',
      positions: [
        { text: 'Two days minimum — flexible which days.',         strength: 3 },
        { text: 'Per-team selection, posted in #people-ops.',      strength: 3 },
        { text: 'Quarterly review built into the policy.',         strength: 2 },
      ],
    },
    {
      who: 'Jordan',
      role: 'Engineering Manager',
      positions: [
        { text: 'Two days — three would conflict with school pickup for parents.', strength: 3 },
        { text: 'Per-team. Manager confirms with group.',          strength: 3 },
        { text: 'Quarterly. First review end of Q1.',              strength: 2 },
      ],
    },
    {
      who: 'Priya',
      role: 'Staff Engineer',
      positions: [
        { text: 'Two days, but not Mondays or Fridays — attendance already low.', strength: 3 },
        { text: 'Per-team, conditional on documentation.',         strength: 3 },
        { text: 'Quarterly + emergency-review option.',            strength: 2 },
      ],
    },
    {
      who: 'Sam',
      role: 'Platform Lead',
      positions: [
        { text: 'Two days; predictability over preference on which days.', strength: 2 },
        { text: 'Per-team. Platform syncs Tue/Thu, growth Wed.',           strength: 3 },
        { text: 'Quarterly. Done.',                                          strength: 1 },
      ],
    },
  ],
  commonGround: [
    'Two days minimum, in-office.',
    'Days are chosen per team and posted in #people-ops.',
    'Reviewed quarterly, with an option to call an emergency review.',
  ],
};

// ============================================================
// VISUALIZATION COMPONENTS
// ============================================================

function VizHeader({ kind, topic, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="row" style={{ '--gap': '10px', marginBottom: 10 }}>
        <span className="label">TEMPLATE · {kind.toUpperCase()}</span>
        <hr className="rule" style={{ flex: 1 }} />
      </div>
      <h2 className="display" style={{ fontSize: 28, color: 'var(--ink)', lineHeight: 1.0, margin: 0 }}>
        {topic}
      </h2>
      {sub && <p className="body" style={{ marginTop: 8, maxWidth: 640, fontSize: 14 }}>{sub}</p>}
    </div>
  );
}

// ---------- 1. DEBATE ----------
function DebateView() {
  const m = DEBATE_MOCK;
  return (
    <div>
      <VizHeader kind="debate" topic={m.topic} sub={`Proposition: "${m.proposition}"`} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {[
          { side: 'PRO',  color: 'var(--navy)',   list: m.pro, sentiment: 'positive' },
          { side: 'CON',  color: 'var(--rust)',   list: m.con, sentiment: 'negative' },
        ].map((col) => (
          <div key={col.side}>
            <div className="row" style={{ '--gap': '10px', marginBottom: 12 }}>
              <span style={{
                fontFamily: 'Archivo', fontSize: 14, fontWeight: 800, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: col.color,
              }}>{col.side}</span>
              <span className="label" style={{ fontSize: 10 }}>{col.list.length} arguments</span>
              <hr className="rule" style={{ flex: 1 }} />
            </div>
            <div className="stack" style={{ '--gap': '10px' }}>
              {col.list.map((a) => (
                <div key={a.id} className="card tight" style={{ borderLeft: `3px solid ${col.color}`, padding: '12px 14px' }}>
                  <div className="row" style={{ '--gap': '8px', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>{a.who}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <span key={i} style={{
                          width: 6, height: 6, borderRadius: 1,
                          background: i < a.strength ? col.color : 'var(--line)',
                        }}></span>
                      ))}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Newsreader', fontSize: 15, lineHeight: 1.45, color: 'var(--ink)' }}>
                    {a.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="row" style={{ '--gap': '10px', marginBottom: 10 }}>
          <span className="label">OUTSTANDING QUESTIONS · {m.questions.length}</span>
          <hr className="rule" style={{ flex: 1 }} />
        </div>
        <div className="stack" style={{ '--gap': '6px' }}>
          {m.questions.map((q) => (
            <div key={q.id} className="row" style={{ '--gap': '10px', alignItems: 'baseline' }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.1em' }}>?</span>
              <span style={{ fontFamily: 'Newsreader', fontSize: 15, color: 'var(--ink-2)' }}>
                <b style={{ fontFamily: 'Archivo', fontSize: 12, letterSpacing: '-0.01em' }}>{q.who}:</b> {q.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 2. BRAINSTORM ----------
function BrainstormView() {
  const m = BRAINSTORM_MOCK;
  // sort by builds desc — most-built-on floats to the top
  const ideas = [...m.ideas].sort((a, b) => b.builds - a.builds);
  const maxBuilds = Math.max(...ideas.map(i => i.builds), 1);
  return (
    <div>
      <VizHeader kind="brainstorm" topic={m.root} sub="Ideas sorted by build-on count. Higher builds float to the top." />
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: 'var(--line)' }}></div>
        <div className="stack" style={{ '--gap': '10px' }}>
          {ideas.map((idea, i) => {
            const hot = idea.builds === maxBuilds;
            return (
              <div key={idea.id} style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: -24, top: 14,
                  width: 17, height: 1, background: 'var(--line)',
                }}></span>
                <span style={{
                  position: 'absolute', left: -22, top: 10,
                  width: 9, height: 9, borderRadius: '50%',
                  background: hot ? 'var(--rust)' : 'var(--paper)',
                  border: '1.5px solid ' + (hot ? 'var(--rust)' : 'var(--line-2)'),
                }}></span>
                <div className={hot ? 'card' : 'card tight'} style={{
                  borderColor: hot ? 'var(--rust)' : undefined,
                  background: hot ? 'var(--paper)' : 'var(--paper)',
                  borderWidth: hot ? 2 : undefined,
                  padding: hot ? '14px 16px' : '10px 14px',
                }}>
                  <div className="row" style={{ '--gap': '10px', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>{idea.who}</span>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--line-2)' }}></span>
                    <span style={{
                      fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, letterSpacing: '0.12em',
                      color: hot ? 'var(--rust)' : 'var(--muted)',
                      fontWeight: hot ? 700 : 500,
                    }}>
                      +{idea.builds} BUILDS
                    </span>
                    {hot && (
                      <span className="pill" style={{ marginLeft: 'auto', background: 'var(--rust)', color: 'var(--cream)', borderColor: 'var(--rust)' }}>
                        <span className="dot" style={{ background: 'var(--cream)' }}></span>most built
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: 'Newsreader', fontSize: hot ? 17 : 15,
                    lineHeight: 1.45, color: 'var(--ink)',
                    fontWeight: hot ? 500 : 400,
                  }}>
                    {idea.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- 3. STAND-UP ----------
function StandupView() {
  const m = STANDUP_MOCK;
  const helpCount = m.rows.reduce((n, r) => n + r.blockers.filter(b => b.help).length, 0);
  return (
    <div>
      <VizHeader
        kind="stand-up"
        topic="Daily stand-up — engineering"
        sub={`${m.rows.length} contributors${helpCount ? ` · ${helpCount} unanswered ask-for-help` : ''}.`}
      />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr',
          background: 'var(--paper-2)',
          borderBottom: '1.5px solid var(--line)',
          padding: '10px 0',
        }}>
          {['Person', 'Yesterday', 'Today', 'Blockers'].map((c, i) => (
            <div key={c} className="label" style={{ paddingLeft: i === 0 ? 18 : 14, fontSize: 10 }}>{c}</div>
          ))}
        </div>
        {m.rows.map((r, ri) => (
          <div key={r.who} style={{
            display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr',
            borderBottom: ri === m.rows.length - 1 ? 'none' : '1px solid var(--line-soft)',
            padding: '14px 0',
          }}>
            <div style={{ paddingLeft: 18, paddingRight: 8 }}>
              <div className="row" style={{ '--gap': '10px' }}>
                <div className="avatar sm">{r.who.slice(0, 2).toUpperCase()}</div>
                <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em' }}>{r.who}</div>
              </div>
            </div>
            {[r.yesterday, r.today].map((col, ci) => (
              <ul key={ci} style={{ margin: 0, padding: '0 14px', listStyle: 'none', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                {col.map((t, i) => (
                  <li key={i} style={{ position: 'relative', paddingLeft: 12 }}>
                    <span style={{ position: 'absolute', left: 0, top: 8, width: 4, height: 4, borderRadius: '50%', background: 'var(--line-2)' }}></span>
                    {t}
                  </li>
                ))}
              </ul>
            ))}
            <div style={{ paddingRight: 18, paddingLeft: 14 }}>
              {r.blockers.length === 0 ? (
                <span className="label" style={{ fontSize: 9 }}>NONE</span>
              ) : r.blockers.map((b, i) => (
                <div key={i} style={{
                  border: b.help ? '1.5px solid var(--rust)' : '1px solid var(--line)',
                  background: b.help ? 'var(--rust-soft)' : 'var(--paper-2)',
                  borderRadius: 'var(--r-sm)', padding: '8px 10px',
                  fontSize: 12, lineHeight: 1.4, color: 'var(--ink-2)',
                  marginBottom: 6,
                }}>
                  {b.help && (
                    <div style={{
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                      color: 'var(--rust)', marginBottom: 4,
                    }}>↗ HELP NEEDED · UNANSWERED</div>
                  )}
                  {b.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 4. RETROSPECTIVE ----------
function RetroView() {
  const m = RETRO_MOCK;
  const Quadrant = ({ title, count, color, bg, children }) => (
    <div style={{
      background: bg, border: `1.5px solid ${color}`, borderRadius: 'var(--r-sm)',
      padding: 18, minHeight: 200, display: 'flex', flexDirection: 'column',
    }}>
      <div className="row" style={{ '--gap': '10px', marginBottom: 14 }}>
        <span style={{
          fontFamily: 'Archivo', fontSize: 13, fontWeight: 800, letterSpacing: '0.12em',
          textTransform: 'uppercase', color,
        }}>{title}</span>
        <span className="label" style={{ fontSize: 9, marginLeft: 'auto' }}>{count}</span>
      </div>
      <div className="stack" style={{ '--gap': '8px', flex: 1 }}>{children}</div>
    </div>
  );

  return (
    <div>
      <VizHeader kind="retrospective" topic="Sprint 14 — retrospective" sub="Three actions logged. Two kudos. Owners assigned for everything in motion." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Quadrant title="Went well" count={m.wentWell.length} color="var(--ok)" bg="var(--ok-soft)">
          {m.wentWell.map((it, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>
              <b style={{ fontFamily: 'Archivo', fontSize: 11, color: 'var(--ok)', letterSpacing: '-0.01em' }}>{it.who} · </b>{it.text}
            </div>
          ))}
        </Quadrant>
        <Quadrant title="Went poorly" count={m.wentPoorly.length} color="var(--rust)" bg="var(--rust-soft)">
          {m.wentPoorly.map((it, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>
              <b style={{ fontFamily: 'Archivo', fontSize: 11, color: 'var(--rust)', letterSpacing: '-0.01em' }}>{it.who} · </b>{it.text}
            </div>
          ))}
        </Quadrant>
        <Quadrant title="Action items" count={m.actions.length} color="var(--navy)" bg="var(--paper)">
          {m.actions.map((it, i) => (
            <div key={i} className="row" style={{ '--gap': '8px', alignItems: 'flex-start' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 6px 2px 4px', borderRadius: 3,
                background: 'var(--navy)', color: 'var(--cream)',
                fontSize: 10, fontWeight: 700, letterSpacing: '-0.01em',
                flex: '0 0 auto',
              }}>
                <span className="avatar sm" style={{ width: 16, height: 16, fontSize: 8, border: 0 }}>{it.owner.slice(0, 2).toUpperCase()}</span>
                {it.owner}
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>{it.text}</span>
            </div>
          ))}
        </Quadrant>
        <Quadrant title="Kudos" count={m.kudos.length} color="var(--navy)" bg="var(--paper)">
          {m.kudos.map((it, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>
              <b style={{ fontFamily: 'Archivo', fontSize: 11, letterSpacing: '-0.01em' }}>{it.from} → {it.to} · </b>{it.text}
            </div>
          ))}
        </Quadrant>
      </div>
    </div>
  );
}

// ---------- 5. NEGOTIATION ----------
function NegotiationView() {
  const m = NEGOTIATION_MOCK;
  return (
    <div>
      <VizHeader
        kind="negotiation"
        topic="Hybrid working policy — 2026 H1"
        sub="Per-party stated positions. The strip at the foot shows where the parties have converged."
      />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${m.parties.length}, 1fr)`, gap: 12, marginBottom: 18 }}>
        {m.parties.map((party) => (
          <div key={party.who} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ '--gap': '8px', marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid var(--navy)' }}>
              <div className={'avatar sm' + (party.who === 'Maya' ? ' you' : '')}>
                {party.who.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>{party.who}</div>
                <div className="label" style={{ fontSize: 9, marginTop: 1 }}>{party.role.split('·')[0].trim().toUpperCase()}</div>
              </div>
            </div>
            <div className="stack" style={{ '--gap': '8px', flex: 1 }}>
              {party.positions.map((p, i) => (
                <div key={i} className="card tight" style={{ padding: '10px 12px' }}>
                  <div className="row" style={{ '--gap': '6px', marginBottom: 4 }}>
                    <span className="label" style={{ fontSize: 9 }}>POS · {String(i + 1).padStart(2, '0')}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                      {Array.from({ length: 3 }).map((_, k) => (
                        <span key={k} style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: k < p.strength ? 'var(--navy)' : 'var(--line)',
                        }}></span>
                      ))}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Newsreader', fontSize: 13, lineHeight: 1.4, color: 'var(--ink)' }}>{p.text}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* common ground strip across the bottom */}
      <div style={{
        background: 'var(--navy)', color: 'var(--cream)',
        borderRadius: 'var(--r-sm)', padding: '16px 20px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="row" style={{ '--gap': '14px', marginBottom: 12 }}>
          <span style={{
            fontFamily: 'Archivo', fontSize: 13, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--cream)',
          }}>Common ground</span>
          <hr className="rule" style={{ flex: 1, background: 'rgba(243,236,217,0.2)' }} />
          <span className="label on-navy" style={{ fontSize: 10 }}>{m.commonGround.length} CONVERGED</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: `repeat(${m.commonGround.length}, 1fr)`, gap: 16 }}>
          {m.commonGround.map((g, i) => (
            <li key={i} style={{ paddingLeft: 22, position: 'relative', fontFamily: 'Newsreader', fontSize: 15, lineHeight: 1.4 }}>
              <span style={{
                position: 'absolute', left: 0, top: 6, width: 14, height: 14, borderRadius: 3,
                background: 'var(--rust)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--cream)', fontSize: 10, fontWeight: 700,
              }}>✓</span>
              {g}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATE CATALOG
// ============================================================
const TEMPLATES = {
  debate: {
    key: 'debate',
    name: 'Debate',
    icon: 'D',
    tagline: 'Argue both sides of one proposition until one outlasts the other.',
    helpText: 'Best for: should-we-or-shouldn\'t-we calls. Two columns, one ledger.',
    labels: ['pro', 'con', 'question', 'clarification', 'synthesis'],
    Visualization: DebateView,
  },
  brainstorm: {
    key: 'brainstorm',
    name: 'Brainstorm',
    icon: 'B',
    tagline: 'Surface ideas, then let the room build on the strongest ones.',
    helpText: 'Best for: opening up a problem space. Ideas that get built on rise to the top.',
    labels: ['idea', 'build-on', 'critique', 'question', 'synthesis'],
    Visualization: BrainstormView,
  },
  standup: {
    key: 'standup',
    name: 'Stand-up',
    icon: 'S',
    tagline: 'A round-the-room status check. Yesterday, today, blockers — in that order.',
    helpText: 'Best for: daily syncs. Unanswered asks-for-help stay highlighted until cleared.',
    labels: ['yesterday', 'today', 'blocker', 'help-needed', 'synthesis'],
    Visualization: StandupView,
  },
  retro: {
    key: 'retro',
    name: 'Retrospective',
    icon: 'R',
    tagline: 'What went well, what went poorly, and what we\'ll do about it.',
    helpText: 'Best for: end-of-sprint reviews. Action items get owners. Kudos get said.',
    labels: ['went-well', 'went-poorly', 'action-item', 'kudos', 'synthesis'],
    Visualization: RetroView,
  },
  negotiation: {
    key: 'negotiation',
    name: 'Negotiation / Mediation',
    icon: 'N',
    tagline: 'Get parties from stated positions to common ground.',
    helpText: 'Best for: policy decisions, conflict resolution. One column per party; convergence strip at the foot.',
    labels: ['position', 'objection', 'concession', 'question', 'common-ground', 'synthesis'],
    Visualization: NegotiationView,
  },
};

const TEMPLATE_ORDER = ['debate', 'brainstorm', 'standup', 'retro', 'negotiation'];

// ============================================================
// EXPORT
// ============================================================
Object.assign(window, {
  TEMPLATES, TEMPLATE_ORDER, SENTIMENT, LabelChip,
  DEBATE_MOCK, BRAINSTORM_MOCK, STANDUP_MOCK, RETRO_MOCK, NEGOTIATION_MOCK,
});
