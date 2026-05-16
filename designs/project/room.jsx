// room.jsx — the mediation room (chat + live summary + consensus + admin)

const { useState, useEffect, useRef, useCallback } = React;

// ============================================================
// SCRIPTED CONVERSATION DATA
// ============================================================
// Three turns the user (Maya, admin) drives by picking a suggestion.
// Each turn adds messages from other participants, an off-topic filtered
// message, then a mediator synthesis, and patches the live summary.
// ============================================================

function timeFromOffset(min) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - min);
  return d.toTimeString().slice(0, 5);
}

function makeInitial(room) {
  return {
    messages: [
      {
        id: 'sys-1', role: 'system', text: `Room ${room.code} opened by ${room.adminName}. Mediator engaged.`, time: timeFromOffset(8),
      },
      {
        id: 'med-0', role: 'mediator', name: 'Mediator', text: `Welcome. I'll keep this on track. The agenda is **${room.agendaTitle.toLowerCase()}**, and we close when all of you agree on (a) a minimum number of in-office days and (b) whether those days are fixed company-wide or chosen per team. Open the floor: what's your starting position?`, time: timeFromOffset(8),
        label: 'synthesis', sentiment: 'neutral',
      },
      {
        id: 'p2-0', role: 'them', name: 'Jordan', text: "Honestly I just want to know what to tell my team by next Monday.", time: timeFromOffset(7),
        label: 'question', sentiment: 'neutral',
      },
    ],
    summary: [
      { heading: 'Agenda', kind: 'body', body: room.agenda },
      { heading: 'Evaluation criteria', kind: 'body', body: room.criteria, agreement: 'Pending agreement.' },
    ],
    consensus: 18,
    turnIdx: 0,
  };
}

const TURNS = [
  // ----- TURN 1: minimum number of days -----
  {
    suggestions: [
      { id: 's1a', text: "Two days minimum — flexible which days per team.", key: '1' },
      { id: 's1b', text: "Three days minimum, with anchor days fixed.", key: '2' },
      { id: 's1c', text: "No mandate. Let teams self-determine.", key: '3' },
    ],
    apply(pick) {
      const newMsgs = [
        { id: 'me-1', role: 'me', name: 'You · Maya', text: pick.text, time: timeFromOffset(6), label: 'position', sentiment: 'neutral' },
        { id: 'p2-1', role: 'them', name: 'Jordan', text: "Two works. Three is too much for the parents on my team — school pickup is real.", time: timeFromOffset(5), label: 'concession', sentiment: 'positive' },
        { id: 'flt-1', role: 'filtered', name: 'Jordan', text: "(off-topic message hidden by mediator: an aside about the football last night)", time: timeFromOffset(5) },
        { id: 'p3-1', role: 'them', name: 'Priya', text: "I'm on two, but Mondays and Fridays shouldn't be the mandatory ones — attendance is always low anyway.", time: timeFromOffset(5), label: 'objection', sentiment: 'negative' },
        { id: 'p4-1', role: 'them', name: 'Sam', text: "+1 to two days. I don't care which two as long as it's predictable.", time: timeFromOffset(4), label: 'position', sentiment: 'positive' },
        { id: 'med-1', role: 'mediator', name: 'Mediator', text: "Hearing strong alignment on **two days minimum**. Three of you mention flexibility on *which* days. Open question for the room: should those two days be **fixed company-wide**, **chosen per team**, or **selected per individual**?", time: timeFromOffset(4), label: 'synthesis', sentiment: 'neutral' },
      ];
      const newSummary = [
        { heading: 'Agenda', kind: 'body', body: this._agenda },
        { heading: 'Evaluation criteria', kind: 'body', body: this._criteria, agreement: 'Pending agreement.' },
        {
          heading: 'Round 1 — Minimum days in office',
          kind: 'list',
          items: [
            { role: 'Maya', text: pick.text },
            { role: 'Jordan', text: 'Supports two days; three would conflict with school pickup.' },
            { role: 'Priya', text: 'Supports two days; objects to Mondays/Fridays as the mandatory days.' },
            { role: 'Sam', text: 'Supports two days; agnostic on which days, asks for predictability.' },
          ],
          agreement: 'Tentative agreement: two days minimum.',
        },
      ];
      return { newMsgs, newSummary, consensusDelta: 22 };
    },
  },

  // ----- TURN 2: who picks the days -----
  {
    suggestions: [
      { id: 's2a', text: "Per-team selection. Each manager confirms with their group.", key: '1' },
      { id: 's2b', text: "Fixed company-wide: Tuesday + Wednesday.", key: '2' },
      { id: 's2c', text: "Each individual picks their own two days.", key: '3' },
    ],
    apply(pick) {
      const newMsgs = [
        { id: 'me-2', role: 'me', name: 'You · Maya', text: pick.text, time: timeFromOffset(3), label: 'position', sentiment: 'neutral' },
        { id: 'p4-2', role: 'them', name: 'Sam', text: "Per-team makes sense — we already have different cadences. Platform syncs Tue/Thu, growth syncs Wed.", time: timeFromOffset(3), label: 'position', sentiment: 'positive' },
        { id: 'p2-2', role: 'them', name: 'Jordan', text: "Per-team. Each manager confirms with the group, posts it in #people-ops.", time: timeFromOffset(2), label: 'concession', sentiment: 'positive' },
        { id: 'p3-2', role: 'them', name: 'Priya', text: "Per-team works for me, as long as the choice is documented somewhere shared, not just verbal.", time: timeFromOffset(2), label: 'concession', sentiment: 'positive' },
        { id: 'med-2', role: 'mediator', name: 'Mediator', text: "Strong alignment: **two days, chosen per team, documented in #people-ops.** One open thread for the criteria: when do we revisit this? The agenda calls for a quarterly review clause.", time: timeFromOffset(2), label: 'synthesis', sentiment: 'neutral' },
      ];
      const newSummary = [
        { heading: 'Agenda', kind: 'body', body: this._agenda },
        { heading: 'Evaluation criteria', kind: 'body', body: this._criteria, agreement: 'Pending review-clause agreement.' },
        {
          heading: 'Round 1 — Minimum days in office',
          kind: 'list',
          items: [
            { role: 'All four', text: 'Agree on two days minimum.' },
            { role: 'Priya', text: 'Mondays and Fridays not preferred as the mandatory days.' },
          ],
          agreement: 'Resolved: two days minimum.',
        },
        {
          heading: 'Round 2 — Who selects the days',
          kind: 'list',
          items: [
            { role: 'Maya', text: pick.text },
            { role: 'Sam', text: 'Per-team. Platform syncs Tue/Thu, growth syncs Wed.' },
            { role: 'Jordan', text: 'Per-team. Manager confirms with group, posts in #people-ops.' },
            { role: 'Priya', text: 'Per-team, conditional on the choice being documented in a shared place.' },
          ],
          agreement: 'Resolved: per-team, posted in #people-ops.',
        },
      ];
      return { newMsgs, newSummary, consensusDelta: 28 };
    },
  },

  // ----- TURN 3: review cadence (consensus reached) -----
  {
    suggestions: [
      { id: 's3a', text: "Quarterly review built into the policy.", key: '1' },
      { id: 's3b', text: "Annual review only — keep it stable.", key: '2' },
      { id: 's3c', text: "Skip review for now; revisit ad hoc.", key: '3' },
    ],
    apply(pick) {
      const newMsgs = [
        { id: 'me-3', role: 'me', name: 'You · Maya', text: pick.text, time: timeFromOffset(1), label: 'position', sentiment: 'neutral' },
        { id: 'p2-3', role: 'them', name: 'Jordan', text: "Quarterly works. First review end of Q1.", time: timeFromOffset(1), label: 'concession', sentiment: 'positive' },
        { id: 'p3-3', role: 'them', name: 'Priya', text: "Agreed. Quarterly with the option to call an emergency review.", time: timeFromOffset(0), label: 'concession', sentiment: 'positive' },
        { id: 'p4-3', role: 'them', name: 'Sam', text: "Yep. Quarterly. Done.", time: timeFromOffset(0), label: 'concession', sentiment: 'positive' },
        { id: 'med-3', role: 'mediator', name: 'Mediator', text: "✓ All four participants now align. Recording the agreement: (a) **two days minimum** in office, (b) **chosen per team** and posted in #people-ops, (c) **quarterly review** with an emergency-review option. **Evaluation criteria are met. Consensus reached.**", time: timeFromOffset(0), tts: true, label: 'synthesis', sentiment: 'positive' },
      ];
      const newSummary = [
        { heading: 'Agenda', kind: 'body', body: this._agenda },
        { heading: 'Evaluation criteria', kind: 'body', body: this._criteria, agreement: '✓ All conditions satisfied.' },
        {
          heading: 'Round 1 — Minimum days in office',
          kind: 'list',
          items: [
            { role: 'All four', text: 'Agree on two days minimum.' },
            { role: 'Priya', text: 'Mondays and Fridays not preferred as the mandatory days.' },
          ],
          agreement: 'Resolved: two days minimum.',
        },
        {
          heading: 'Round 2 — Who selects the days',
          kind: 'list',
          items: [
            { role: 'All four', text: 'Agree the two days are chosen per team.' },
            { role: 'Priya', text: 'Conditional on documentation in #people-ops.' },
          ],
          agreement: 'Resolved: per-team, posted in #people-ops.',
        },
        {
          heading: 'Round 3 — Review cadence',
          kind: 'list',
          items: [
            { role: 'All four', text: 'Agree on quarterly review.' },
            { role: 'Priya', text: 'Adds option for an emergency review between cadences.' },
          ],
          agreement: 'Resolved: quarterly review + emergency-review option.',
        },
        {
          heading: 'Agreement reached',
          kind: 'list',
          items: [
            { role: 'Minimum days', text: 'Two in-office days per week.' },
            { role: 'Selection', text: 'Chosen per team, posted in #people-ops.' },
            { role: 'Review cadence', text: 'Quarterly, with an emergency-review option.' },
            { role: 'Effective', text: 'H1 2026.' },
          ],
          agreement: 'Consensus reached at ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + '.',
        },
      ];
      return { newMsgs, newSummary, consensusDelta: 18, consensusReached: true };
    },
  },
];

// ============================================================
// SUB-COMPONENTS
// ============================================================
function ConsensusBar({ pct, threshold = 80, met }) {
  return (
    <div className="card consensus-card">
      <div className="row" style={{justifyContent: 'space-between', marginBottom: 10}}>
        <div className="label">CONSENSUS</div>
        <div className="row" style={{'--gap': '6px'}}>
          <span className="num" style={{fontSize: 22, color: met ? 'var(--ok)' : 'var(--ink)'}}>{Math.round(pct)}%</span>
          <span className="label" style={{fontSize: 10}}>/ {threshold}% needed</span>
        </div>
      </div>
      <div className="consensus-bar">
        <div className={'consensus-fill' + (met ? ' met' : '')} style={{width: pct + '%'}}></div>
        <div className="threshold-marker" style={{left: threshold + '%'}}></div>
      </div>
      <div className="row" style={{justifyContent: 'space-between', marginTop: 10}}>
        <span className="label" style={{fontSize: 10}}>
          {met ? 'THRESHOLD MET · READY TO CLOSE' : `${Math.max(0, threshold - Math.round(pct))}% TO THRESHOLD`}
        </span>
        <span className="label" style={{fontSize: 10}}>EVALUATED LIVE</span>
      </div>
    </div>
  );
}

function ParticipantRow({ p, isYou, onClick }) {
  return (
    <div className={'p-row' + (onClick ? ' clickable' : '')} onClick={onClick}>
      <div className={'avatar' + (isYou ? ' you' : '')}>{p.initials}</div>
      <div style={{minWidth: 0, flex: 1}}>
        <div className="p-name">{p.name}{isYou ? ' · you' : ''}</div>
        <div className="p-sub">{p.role}</div>
      </div>
      <span className={'p-bullet ' + (p.state === 'thinking' ? 'thinking' : p.state === 'away' ? 'away' : '')}></span>
      {onClick && (
        <span style={{color: 'var(--muted-2)', marginLeft: 6, display: 'flex', alignItems: 'center'}}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M9 6l6 6-6 6"/>
          </svg>
        </span>
      )}
    </div>
  );
}

// ============================================================
// PARTICIPANT INSPECTOR (slide-in drawer)
// ============================================================
function ParticipantInspector({ participant, messages, template, onClose }) {
  const open = !!participant;

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Aggregate the participant's messages
  const myMessages = participant
    ? messages.filter(m =>
        (m.role === 'me' && participant.isYou) ||
        (m.role === 'them' && m.name === participant.name) ||
        (m.role === 'mediator' && participant.id === 'mediator')
      )
    : [];

  // Label histogram — use the current template's label set as the
  // canonical order so empty buckets still show as zero rows.
  const tpl = window.TEMPLATES?.[template] || window.TEMPLATES?.negotiation;
  const labelSet = tpl?.labels || [];
  const counts = {};
  labelSet.forEach(l => counts[l] = 0);
  myMessages.forEach(m => {
    if (m.label) counts[m.label] = (counts[m.label] || 0) + 1;
  });
  const maxCount = Math.max(1, ...Object.values(counts));

  // Sentiment row
  const sentCounts = { positive: 0, negative: 0, neutral: 0 };
  myMessages.forEach(m => {
    const s = m.sentiment || 'neutral';
    if (sentCounts[s] != null) sentCounts[s]++;
  });

  return (
    <>
      <div className={'inspector-backdrop' + (open ? ' open' : '')} onClick={onClose}></div>
      <aside className={'inspector-drawer' + (open ? ' open' : '')} aria-hidden={!open}>
        {participant && (
          <>
            <div className="inspector-head">
              <div className="row" style={{'--gap': '14px'}}>
                <div className={'avatar lg' + (participant.isYou ? ' you' : '')}>{participant.initials}</div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div className="label">PARTICIPANT</div>
                  <div style={{fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em', marginTop: 2}}>
                    {participant.name}{participant.isYou ? ' · you' : ''}
                  </div>
                  <div className="label" style={{marginTop: 4, fontSize: 10}}>
                    {participant.isYou ? 'FACILITATOR · ADMIN' : 'PARTICIPANT'} · {participant.role.toUpperCase()}
                  </div>
                </div>
                <button className="inspector-close" onClick={onClose} aria-label="Close">
                  <Icon.Close/>
                </button>
              </div>
              <div className="row" style={{'--gap': '20px'}}>
                <div>
                  <div className="num" style={{fontSize: 22}}>{myMessages.length}</div>
                  <div className="label" style={{fontSize: 9}}>CONTRIBUTIONS</div>
                </div>
                <div>
                  <div className="num" style={{fontSize: 22}}>{Object.values(counts).filter(c => c > 0).length}</div>
                  <div className="label" style={{fontSize: 9}}>LABELS USED</div>
                </div>
                <div>
                  <div className="num" style={{fontSize: 22, color: sentCounts.negative > sentCounts.positive ? 'var(--rust)' : 'var(--navy)'}}>
                    {sentCounts.positive + sentCounts.negative === 0 ? '—' : Math.round(100 * sentCounts.positive / (sentCounts.positive + sentCounts.negative)) + '%'}
                  </div>
                  <div className="label" style={{fontSize: 9}}>POSITIVE LEAN</div>
                </div>
              </div>
            </div>

            <div className="inspector-body">
              {/* LABEL HISTOGRAM */}
              <div className="row" style={{'--gap': '10px', marginBottom: 12}}>
                <span className="label">LABEL DISTRIBUTION</span>
                <hr className="rule" style={{flex: 1}}/>
              </div>
              <div className="histogram">
                {labelSet.map(l => (
                  <div key={l} className="hrow">
                    <span className="hlabel">{l}</span>
                    <div className="hbar">
                      <div className="hfill" style={{width: (counts[l] / maxCount * 100) + '%', opacity: counts[l] ? 1 : 0.2}}></div>
                    </div>
                    <span className="hcount" style={{color: counts[l] ? 'var(--ink)' : 'var(--muted-2)'}}>{counts[l]}</span>
                  </div>
                ))}
              </div>

              {/* SENTIMENT */}
              <div className="row" style={{'--gap': '10px', marginTop: 28, marginBottom: 12}}>
                <span className="label">SENTIMENT</span>
                <hr className="rule" style={{flex: 1}}/>
              </div>
              <div className="sent-row">
                {[
                  { key: 'positive', label: 'Positive' },
                  { key: 'neutral',  label: 'Neutral'  },
                  { key: 'negative', label: 'Negative' },
                ].map(s => (
                  <div key={s.key} className="sent-cell">
                    <div style={{display: 'flex', alignItems: 'center', marginBottom: 6}}>
                      <span className="sent-dot" style={{background: SENTIMENT[s.key].dot}}></span>
                      <span className="label" style={{fontSize: 9}}>{s.label}</span>
                    </div>
                    <div className="num" style={{fontSize: 22, color: 'var(--ink)'}}>{sentCounts[s.key]}</div>
                  </div>
                ))}
              </div>

              {/* RECENT MESSAGES */}
              <div className="row" style={{'--gap': '10px', marginTop: 28, marginBottom: 12}}>
                <span className="label">RECENT MESSAGES · NEWEST FIRST</span>
                <hr className="rule" style={{flex: 1}}/>
              </div>
              {myMessages.length === 0 ? (
                <div style={{padding: '24px 14px', textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'Newsreader', fontSize: 14}}>
                  No contributions yet in this session.
                </div>
              ) : (
                [...myMessages].reverse().map(m => (
                  <div key={m.id} className="insp-msg">
                    <div className="insp-meta">
                      <LabelChip label={m.label || 'untagged'} sentiment={m.sentiment || 'neutral'}/>
                      <span className="insp-time" style={{marginLeft: 'auto'}}>{m.time}</span>
                    </div>
                    <div className="insp-text">
                      {m.text.replace(/\*\*/g, '')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function ChatMessage({ m, onSpeak, speakingId }) {
  if (m.role === 'system') {
    return (
      <div style={{textAlign: 'center', padding: '4px 0'}}>
        <span className="label" style={{fontSize: 10}}>· {m.text} ·</span>
      </div>
    );
  }

  if (m.role === 'filtered') {
    return (
      <div className="msg filtered">
        <div className="msg-body" style={{flex: 1}}>
          <div className="msg-text">{m.text}</div>
        </div>
      </div>
    );
  }

  const isMe = m.role === 'me';
  const isMediator = m.role === 'mediator';
  const cls = 'msg' + (isMediator ? ' mediator' : '');
  const initials = m.name.split(' ').filter(s => !s.startsWith('·')).map(s => s[0]).join('').slice(0, 2).toUpperCase();

  // text with **bold** markdown
  const renderText = (txt) => {
    const parts = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0, m2;
    let i = 0;
    while ((m2 = re.exec(txt)) !== null) {
      if (m2.index > last) parts.push(<span key={i++}>{txt.slice(last, m2.index)}</span>);
      parts.push(<strong key={i++}>{m2[1]}</strong>);
      last = m2.index + m2[0].length;
    }
    if (last < txt.length) parts.push(<span key={i++}>{txt.slice(last)}</span>);
    return parts;
  };

  return (
    <div className={cls}>
      <div className={'avatar' + (isMe ? ' you' : '')} style={isMediator ? null : undefined}>
        {isMediator ? 'C' : initials}
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-name">{m.name}</span>
          <span className="msg-time">{m.time}</span>
          {isMediator && (
            <button
              className={'speak-btn' + (speakingId === m.id ? ' speaking' : '')}
              onClick={() => onSpeak(m.id)}
              aria-label="Play this message"
              title="Play with TTS"
              style={{marginLeft: 'auto'}}
            >
              <Icon.Speaker/>
            </button>
          )}
        </div>
        <div className="msg-text">{renderText(m.text)}</div>
        {m.label && (
          <div className="chip-row">
            <LabelChip label={m.label} sentiment={m.sentiment || 'neutral'} dark={isMediator}/>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN ROOM
// ============================================================
function Room({ user, room, isAdmin, voiceMode, setVoiceMode, onCloseMeeting, onLeave }) {
  const initial = useRef(makeInitial(room)).current;
  const [messages, setMessages] = useState(initial.messages);
  const [summary, setSummary] = useState(initial.summary);
  const [consensus, setConsensus] = useState(initial.consensus);
  const [turnIdx, setTurnIdx] = useState(0);
  const [meetingStatus, setMeetingStatus] = useState('open'); // open | locked | consensus | closed
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [participantsState, setParticipantsState] = useState(room.participants);
  // template + inspector state added in the template/inspector pass
  const [centerTab, setCenterTab] = useState('live'); // 'live' (template viz) | 'minutes'
  const [inspectorId, setInspectorId] = useState(null);
  const inspectorParticipant = inspectorId ? participantsState.find(p => p.id === inspectorId) : null;
  const template = room.template || 'negotiation';
  const Viz = window.TEMPLATES?.[template]?.Visualization || null;

  // bind room context to turn data so apply() can reference original agenda/criteria
  TURNS.forEach(t => { t._agenda = room.agenda; t._criteria = room.criteria; });

  // auto-scroll chat to bottom on new message
  const feedRef = useRef(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  // simulated TTS auto-play on consensus-reached mediator message (when voiceMode is on)
  useEffect(() => {
    if (!voiceMode) return;
    const last = messages[messages.length - 1];
    if (last && last.role === 'mediator' && last.tts && speakingId !== last.id) {
      handleSpeak(last.id);
    }
    // eslint-disable-next-line
  }, [messages, voiceMode]);

  // close kebab on outside click
  useEffect(() => {
    function onDoc(e) {
      if (!kebabOpen) return;
      if (!e.target.closest('.kebab-wrap')) setKebabOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [kebabOpen]);

  // simulate STT: after 1.8s of "listening", auto-fill the input with a transcription
  const sttTimer = useRef(null);
  useEffect(() => {
    if (listening) {
      sttTimer.current = setTimeout(() => {
        const next = TURNS[turnIdx]?.suggestions?.[0]?.text || "I'd like to add something here.";
        setDraft(next);
        setListening(false);
      }, 1800);
      return () => clearTimeout(sttTimer.current);
    }
  }, [listening, turnIdx]);

  function handleSpeak(id) {
    setSpeakingId(id);
    setTimeout(() => setSpeakingId((cur) => (cur === id ? null : cur)), 3200);
  }

  function pickSuggestion(s) {
    advanceTurn(s);
  }

  function sendDraft() {
    if (!draft.trim()) return;
    // pick the closest current suggestion based on the draft (best effort), or use as freeform
    const cur = TURNS[turnIdx];
    if (!cur) return;
    const matched = cur.suggestions.find(s => s.text === draft.trim()) || cur.suggestions[0];
    advanceTurn({ ...matched, text: draft.trim() });
  }

  function advanceTurn(pick, forceIdx) {
    // Allow callers (skipAhead) to pin the turn index explicitly, since
    // multiple advanceTurn calls queued in the same tick share a stale
    // closure over `turnIdx`.
    const idx = (typeof forceIdx === 'number') ? forceIdx : turnIdx;
    const cur = TURNS[idx];
    if (!cur) return;
    setDraft('');
    setListening(false);

    // show "thinking" state for other participants briefly
    setParticipantsState(prev => prev.map(p => p.isYou ? p : ({ ...p, state: 'thinking' })));

    // append your message immediately
    const { newMsgs, newSummary, consensusDelta, consensusReached } = cur.apply(pick);

    // stage the messages so they don't all land at once (feels alive)
    let i = 0;
    const stagger = () => {
      if (i >= newMsgs.length) {
        setParticipantsState(prev => prev.map(p => ({ ...p, state: 'online' })));
        setSummary(newSummary);
        setConsensus(c => Math.min(100, c + consensusDelta));
        if (consensusReached) setMeetingStatus('consensus');
        setTurnIdx(idx + 1);
        return;
      }
      const m = newMsgs[i++];
      setMessages(prev => [...prev, m]);
      setTimeout(stagger, m.role === 'me' ? 80 : 350 + Math.random() * 350);
    };
    stagger();
  }

  function lockRoom() {
    setMeetingStatus(s => s === 'locked' ? 'open' : s === 'open' ? 'locked' : s);
    setKebabOpen(false);
  }

  function closeEarly() {
    if (!window.confirm('Close the meeting before consensus is reached? Participants will lose chat access and the current summary becomes the final minutes.')) return;
    setKebabOpen(false);
    onCloseMeeting({ messages, summary, consensus, premature: true });
  }

  function closeWithConsensus() {
    onCloseMeeting({ messages, summary, consensus, premature: false });
  }

  function copyCode() {
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setKebabOpen(false);
  }

  function skipAhead() {
    // Tweaks helper — fast-forward through all remaining turns.
    // We pass the explicit turn index into advanceTurn so each call uses
    // the right TURNS entry (avoiding the stale-closure trap on turnIdx).
    setKebabOpen(false);
    let i = turnIdx;
    const runOne = () => {
      if (i >= TURNS.length) return;
      const cur = TURNS[i];
      const pick = cur.suggestions[0];
      advanceTurn(pick, i);
      i++;
      // Wait long enough for the previous turn's staggered messages to land
      // before kicking off the next one — each turn has ~5–7 messages with
      // a 350–700ms gap, so ~3.5s is safe.
      if (i < TURNS.length) setTimeout(runOne, 3500);
    };
    runOne();
  }

  const currentTurn = TURNS[turnIdx];
  const consensusMet = consensus >= 80 || meetingStatus === 'consensus';

  return (
    <div className="room" data-screen-label={meetingStatus === 'consensus' ? '06 Room — consensus' : '05 Room'}>

      {/* ========== HEADER ========== */}
      <div className="room-header">
        <div className="brand" style={{gap: 10}}>
          <Brandmark/>
          <Wordmark/>
        </div>
        <div style={{width: 1, height: 28, background: 'var(--line)'}}></div>
        <div style={{flex: 1, minWidth: 0}}>
          <div className="row" style={{'--gap': '10px'}}>
            <span className="mono" style={{fontSize: 11, letterSpacing: '0.14em', color: 'var(--muted)'}}>{room.code}</span>
            {meetingStatus === 'open' && <span className="pill live"><span className="dot"></span> Live</span>}
            {meetingStatus === 'locked' && <span className="pill locked"><span className="dot"></span> Locked</span>}
            {meetingStatus === 'consensus' && <span className="pill ok"><span className="dot"></span> Consensus reached</span>}
          </div>
          <div style={{fontWeight: 700, fontSize: 15, letterSpacing: '-0.015em', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
            {room.agendaTitle}
          </div>
        </div>

        <div className="avatar-row sm">
          {participantsState.map(p => (
            <div key={p.id} className={'avatar sm' + (p.isYou ? ' you' : '')} title={p.name}>{p.initials}</div>
          ))}
        </div>

        <button
          className={'btn btn-sm ' + (voiceMode ? 'btn-ink' : 'btn-soft')}
          onClick={() => setVoiceMode(!voiceMode)}
          title="Toggle voice mode (auto-play mediator messages)"
        >
          <Icon.Speaker/> Voice {voiceMode ? 'ON' : 'OFF'}
        </button>

        {/* Admin actions */}
        {isAdmin && (
          <>
            {consensusMet && (
              <button className="btn btn-primary btn-sm" onClick={closeWithConsensus}>
                <Icon.Check/> Close & Export
              </button>
            )}
            <div className="kebab-wrap">
              <button className="kebab-btn" onClick={() => setKebabOpen(o => !o)} aria-label="Admin menu">
                <Icon.Kebab/>
              </button>
              {kebabOpen && (
                <div className="kebab-menu">
                  <div className="head">
                    <div className="label">ADMIN ACTIONS</div>
                  </div>
                  <button className="item" onClick={copyCode}>
                    <Icon.Users style={{opacity: 0.6}}/>
                    <div style={{flex: 1}}>
                      Copy room code
                      <span className="sub">Share with new participants</span>
                    </div>
                  </button>
                  <button className="item" onClick={lockRoom}>
                    <Icon.Lock style={{opacity: 0.6}}/>
                    <div style={{flex: 1}}>
                      {meetingStatus === 'locked' ? 'Unlock room' : 'Lock room'}
                      <span className="sub">{meetingStatus === 'locked' ? 'Anyone with the code can rejoin' : 'No new participants can enter'}</span>
                    </div>
                  </button>
                  <button className="item" onClick={skipAhead}>
                    <Icon.ArrowRight style={{opacity: 0.6}}/>
                    <div style={{flex: 1}}>
                      Skip to consensus
                      <span className="sub">Demo: fast-forward the discussion</span>
                    </div>
                  </button>
                  <div className="item-divider"></div>
                  <button className="item danger" onClick={closeEarly}>
                    <Icon.Close/>
                    <div style={{flex: 1}}>
                      Close meeting early
                      <span className="sub" style={{color: 'rgba(197,77,44,0.7)'}}>End now, before consensus is reached</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {!isAdmin && (
          <button className="btn btn-soft btn-sm" onClick={onLeave}>Leave</button>
        )}
      </div>

      {/* ========== BODY ========== */}
      <div className="room-body">

        {/* ----- CHAT (left) ----- */}
        <aside className="room-chat">
          <div className="chat-head">
            <div>
              <div className="label">DISCUSSION</div>
              <div style={{fontSize: 13, fontWeight: 600, marginTop: 2}}>
                {messages.filter(m => m.role !== 'system' && m.role !== 'filtered').length} contributions
                <span style={{color: 'var(--muted)', fontWeight: 400}}> · {messages.filter(m => m.role === 'filtered').length} filtered</span>
              </div>
            </div>
            <span className="pill"><span className="dot" style={{background: 'var(--ok)'}}></span> Mediator on</span>
          </div>

          <div className="chat-feed" ref={feedRef}>
            {messages.map(m => (
              <ChatMessage key={m.id} m={m} onSpeak={handleSpeak} speakingId={speakingId}/>
            ))}
            {!currentTurn && meetingStatus !== 'closed' && (
              <div className="card" style={{background: 'var(--ok-soft)', borderColor: 'rgba(45,107,79,0.3)', textAlign: 'center', padding: 16}}>
                <Icon.Check style={{color: 'var(--ok)', width: 24, height: 24, marginBottom: 6}}/>
                <div style={{fontWeight: 700, color: 'var(--ok)', fontSize: 14, letterSpacing: '-0.01em'}}>Consensus reached.</div>
                <div className="body" style={{fontSize: 12, marginTop: 4}}>Admin can now close & export the minutes.</div>
              </div>
            )}
          </div>

          <div className="chat-input-bar">
            {currentTurn && meetingStatus !== 'closed' && (
              <div className="suggest-row">
                <div className="label">SUGGESTED REPLIES</div>
                {currentTurn.suggestions.map(s => (
                  <button key={s.id} className="suggest" onClick={() => pickSuggestion(s)}>
                    <span className="key">{s.key}</span>
                    <span style={{flex: 1}}>{s.text}</span>
                    <Icon.ArrowRight style={{opacity: 0.5, flex: '0 0 auto'}}/>
                  </button>
                ))}
              </div>
            )}

            {listening && (
              <div className="listening-banner">
                <div className="waveform">
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
                <span>Listening…</span>
                <button
                  onClick={() => setListening(false)}
                  className="btn btn-xs"
                  style={{marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(197,77,44,0.3)', color: 'var(--rust-deep)'}}
                >Stop</button>
              </div>
            )}

            <div style={{position: 'relative'}}>
              <div className="input-row">
                <input
                  type="text"
                  placeholder={currentTurn ? "Type or pick a suggestion…" : "Discussion closed."}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendDraft(); }}
                  disabled={!currentTurn || meetingStatus === 'closed'}
                />
                <button
                  className={'icon-btn' + (listening ? ' active' : '')}
                  onClick={() => setListening(l => !l)}
                  title="Voice input (STT)"
                  disabled={!currentTurn}
                  style={{position: 'relative'}}
                >
                  <Icon.Mic/>
                  {listening && <span className="mic-pulse"></span>}
                </button>
                <button
                  className="icon-btn send"
                  onClick={sendDraft}
                  disabled={!draft.trim() || !currentTurn}
                  title="Send"
                >
                  <Icon.Send/>
                </button>
              </div>
            </div>
            <div className="row" style={{justifyContent: 'space-between', marginTop: 8}}>
              <span className="label" style={{fontSize: 9}}>ENTER TO SEND</span>
              <span className="label" style={{fontSize: 9}}>MEDIATOR FILTERS OFF-TOPIC INPUT</span>
            </div>
          </div>
        </aside>

        {/* ----- CENTER (tabbed: live template view + minutes) ----- */}
        <main className="room-center">
          <div className="center-tabs">
            <button
              className={'center-tab' + (centerTab === 'live' ? ' active' : '')}
              onClick={() => setCenterTab('live')}
            >
              Live view
              {window.TEMPLATES?.[template] && (
                <span className="count">{window.TEMPLATES[template].name}</span>
              )}
            </button>
            <button
              className={'center-tab' + (centerTab === 'minutes' ? ' active' : '')}
              onClick={() => setCenterTab('minutes')}
            >
              Minutes
              <span className="count">§ {summary.length}</span>
            </button>
            <div style={{flex: 1}}></div>
            <span className="label" style={{alignSelf: 'center', paddingRight: 4, fontSize: 10}}>
              ROOM · {room.code}
            </span>
          </div>

          <div className="center-body">

            {meetingStatus === 'consensus' && (
              <div className="doc-banner consensus-met">
                <div style={{width: 48, height: 48, background: 'rgba(243,236,217,0.18)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto'}}>
                  <Icon.Check style={{width: 22, height: 22}}/>
                </div>
                <div style={{flex: 1}}>
                  <div className="bigtext">Consensus reached</div>
                  <div className="subtext">Evaluation criteria satisfied. Facilitator may close the meeting.</div>
                </div>
                {isAdmin && (
                  <button className="btn btn-sm" style={{background: 'var(--cream)', color: 'var(--ok)', borderColor: 'var(--cream)'}} onClick={closeWithConsensus}>
                    Close & Export
                  </button>
                )}
              </div>
            )}

            <ConsensusBar pct={consensus} met={consensusMet}/>

            {centerTab === 'live' && Viz ? (
              <div style={{marginTop: 32}}>
                <Viz/>
              </div>
            ) : (
              <div className="summary-doc" style={{maxWidth: 720, padding: '32px 0 40px'}}>
                <div className="doc-head">
                  <div className="label">LIVE SUMMARY · MARKDOWN</div>
                  <h1 className="doc-title">{room.agendaTitle}</h1>
                  <div className="doc-meta">
                    <div>
                      <span className="label">ROOM</span>
                      <span className="mono" style={{fontWeight: 600, fontSize: 14}}>{room.code}</span>
                    </div>
                    <div>
                      <span className="label">FACILITATOR</span>
                      <span style={{fontWeight: 600, fontSize: 14}}>{room.adminName}</span>
                    </div>
                    <div>
                      <span className="label">STATUS</span>
                      <span style={{fontWeight: 600, fontSize: 14, color: consensusMet ? 'var(--ok)' : 'var(--rust)'}}>
                        {consensusMet ? 'Consensus reached' : 'In progress'}
                      </span>
                    </div>
                  </div>
                </div>

                {summary.map((s, i) => (
                  <section key={i + '-' + s.heading}>
                    <h3 className="s-head">
                      <span className="s-num">§ {String(i + 1).padStart(2, '0')}</span>
                      {s.heading}
                    </h3>
                    {s.kind === 'list' ? (
                      <ul className="s-list">
                        {s.items.map((it, j) => (
                          <li key={j}>{it.role && <strong>{it.role}: </strong>}{it.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="s-body">{s.body}</p>
                    )}
                    {s.agreement && <div className="agree-line">— {s.agreement}</div>}
                  </section>
                ))}
              </div>
            )}

          </div>
        </main>

        {/* ----- PARTICIPANTS (right) ----- */}
        <aside className="room-right">
          <div className="row" style={{justifyContent: 'space-between', marginBottom: 10}}>
            <span className="label">PARTICIPANTS · {participantsState.length}</span>
            <span className="label" style={{fontSize: 9, opacity: 0.7}}>TAP TO INSPECT</span>
          </div>
          <div className="card flat" style={{padding: 4, border: 0}}>
            {participantsState.map(p => (
              <ParticipantRow key={p.id} p={p} isYou={p.isYou} onClick={() => setInspectorId(p.id)}/>
            ))}
          </div>

          <hr className="rule" style={{margin: '24px 0 20px'}}/>

          <div className="label" style={{marginBottom: 10}}>EVALUATION CRITERIA</div>
          <p className="body" style={{fontSize: 13, margin: 0, lineHeight: 1.45}}>{room.criteria}</p>

          <hr className="rule" style={{margin: '24px 0 20px'}}/>

          <div className="label" style={{marginBottom: 10}}>VOICE</div>
          <div className="row" style={{justifyContent: 'space-between'}}>
            <span style={{fontSize: 13, fontWeight: 500}}>Auto-play mediator (TTS)</span>
            <button
              onClick={() => setVoiceMode(!voiceMode)}
              style={{
                width: 36, height: 20, borderRadius: 999,
                border: 0, padding: 2,
                background: voiceMode ? 'var(--rust)' : 'var(--line-2)',
                cursor: 'pointer',
                transition: 'background 0.14s',
                display: 'flex', alignItems: 'center',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--cream)',
                transform: voiceMode ? 'translateX(16px)' : 'translateX(0)',
                transition: 'transform 0.18s',
              }}></div>
            </button>
          </div>
          <div className="label" style={{fontSize: 9, marginTop: 6, fontFamily: 'Archivo', letterSpacing: 0, textTransform: 'none', color: 'var(--muted)'}}>
            Mic icon below the chat input also accepts speech-to-text.
          </div>

          <hr className="rule" style={{margin: '24px 0 20px'}}/>

          <div className="label" style={{marginBottom: 8}}>FILTERED THIS SESSION</div>
          <div className="row" style={{'--gap': '8px', alignItems: 'baseline'}}>
            <span className="num" style={{fontSize: 32}}>{messages.filter(m => m.role === 'filtered').length}</span>
            <span className="label" style={{fontSize: 10}}>OFF-TOPIC MESSAGES</span>
          </div>
          <p className="body" style={{fontSize: 12, marginTop: 6, lineHeight: 1.4}}>
            The mediator hides asides and non-contributing messages from the summary, but keeps them in chat for transparency.
          </p>
        </aside>

      </div>

      <ParticipantInspector
        participant={inspectorParticipant}
        messages={messages}
        template={template}
        onClose={() => setInspectorId(null)}
      />
    </div>
  );
}

Object.assign(window, { Room, ConsensusBar, TURNS });
