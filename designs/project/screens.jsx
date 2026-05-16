// screens.jsx — Signup, Lobby, CreateRoom, EndScreen + shared brand/icons

const { useState, useEffect, useRef } = React;

// ============================================================
// ICONS (inline SVG so we don't need an icon font)
// ============================================================
const Icon = {
  Mic: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="3" width="6" height="12" rx="3"/>
      <path d="M5 11a7 7 0 0 0 14 0"/>
      <path d="M12 18v3"/>
    </svg>
  ),
  Speaker: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M11 5L6 9H3v6h3l5 4z"/>
      <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
    </svg>
  ),
  Send: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12l16-8-5 18-4-8-7-2z"/>
    </svg>
  ),
  Kebab: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...p}>
      <circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>
    </svg>
  ),
  Lock: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="5" y="11" width="14" height="9" rx="1.5"/>
      <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
    </svg>
  ),
  Close: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M6 6l12 12M18 6L6 18"/>
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12l5 5L20 6"/>
    </svg>
  ),
  Download: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 4v12"/>
      <path d="M7 11l5 5 5-5"/>
      <path d="M5 20h14"/>
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  ArrowRight: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  ),
  Users: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="9" r="3.5"/>
      <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/>
      <circle cx="17" cy="8" r="2.5"/>
      <path d="M22 19c0-2.8-2-4.5-5-4.5"/>
    </svg>
  ),
  Eye: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
};

// ============================================================
// Brand / logo block
// ============================================================
function Brandmark({ size = 'md', onLight = false }) {
  const cls = 'brand-mark' + (size === 'lg' ? ' lg' : size === 'xl' ? ' xl' : '');
  return <div className={cls}>C</div>;
}

function Wordmark({ children = 'Consensus' }) {
  return <span className="wordmark">{children}</span>;
}

function BrandLockup({ size = 'md', onLight = false, sub }) {
  return (
    <div className="brand" style={{flexDirection: 'column', alignItems: 'flex-start', gap: 14}}>
      <Brandmark size={size} onLight={onLight}/>
      <div>
        <Wordmark/>
        {sub && <div className="label" style={{marginTop: 6, color: onLight ? 'rgba(243,236,217,0.6)' : undefined}}>{sub}</div>}
      </div>
    </div>
  );
}

// ============================================================
// Shared entry-shell (left = brand panel, right = form)
// ============================================================
function EntryShell({ side, children }) {
  return (
    <div className="entry-shell">
      <div className="entry-side">
        <div>
          <div className="brand" style={{gap: 14, marginBottom: 56}}>
            <Brandmark/>
            <div>
              <Wordmark/>
              <div className="label on-navy" style={{marginTop: 4}}>A protocol for getting to yes.</div>
            </div>
          </div>
          {side}
        </div>
        <div style={{position: 'relative', zIndex: 1}}>
          <div className="label on-navy">EST. MMXXVI · STRUCTURED FACILITATION</div>
        </div>
      </div>
      <div className="entry-main">
        {children}
      </div>
    </div>
  );
}

// ============================================================
// 1. SIGNUP
// ============================================================
function Signup({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState({});

  const emailValid = /^\S+@\S+\.\S+$/.test(email);
  const usernameValid = username.trim().length >= 2;
  const ready = emailValid && usernameValid;

  function handleSubmit(e) {
    e.preventDefault();
    setTouched({email: true, username: true});
    if (!ready) return;
    onSubmit({ email: email.trim(), username: username.trim() });
  }

  return (
    <EntryShell
      side={
        <div style={{marginTop: 32, maxWidth: 460}}>
          <div className="display" style={{fontSize: 64, color: 'var(--cream)', position: 'relative', zIndex: 1}}>
            Every<br/>voice<br/>counts.<br/><span style={{color: 'var(--rust)'}}>Twice.</span>
          </div>
          <p className="lede" style={{color: 'rgba(243,236,217,0.75)', marginTop: 32, position: 'relative', zIndex: 1}}>
            A facilitation tool for meetings that need to actually conclude. Set an agenda, define what consensus looks like, then talk it out — Consensus listens, summarizes, and tells you when you're done.
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{maxWidth: 460, width: '100%'}}>
        <div className="label">STEP 01 · ACCOUNT</div>
        <h1 className="h1" style={{margin: '12px 0 14px'}}>Create your<br/>delegation.</h1>
        <p className="body" style={{margin: '0 0 36px', maxWidth: 380}}>
          One account holds your past meetings and lets others identify you across rooms.
        </p>

        <div className="stack" style={{'--gap': '22px'}}>
          <div>
            <label className="field-label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@organisation.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(t => ({...t, email: true}))}
            />
            {touched.email && !emailValid && (
              <div className="label" style={{color: 'var(--rust)', marginTop: 8}}>Enter a valid email.</div>
            )}
          </div>
          <div>
            <label className="field-label">Username</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Maya R."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setTouched(t => ({...t, username: true}))}
            />
            <div className="label" style={{marginTop: 8, textTransform: 'none', letterSpacing: 0.04, fontFamily: 'Archivo', fontSize: 12, color: 'var(--muted)'}}>
              This is how you'll appear to other participants.
            </div>
          </div>
        </div>

        <div className="row" style={{marginTop: 40, '--gap': '16px'}}>
          <button type="submit" className="btn btn-primary btn-lg">
            Continue <Icon.ArrowRight/>
          </button>
          <a href="#" onClick={(e) => e.preventDefault()} style={{fontSize: 13, fontWeight: 500}}>Already have an account?</a>
        </div>

        <div style={{marginTop: 56}}>
          <hr className="rule"/>
          <div className="row" style={{marginTop: 16, '--gap': '24px'}}>
            <div className="label">PRIVACY · MMXXVI</div>
            <div className="label">DOC v0.4</div>
            <div className="label" style={{marginLeft: 'auto'}}>EN-GB</div>
          </div>
        </div>
      </form>
    </EntryShell>
  );
}

// ============================================================
// 2. LOBBY — join existing or create new
// ============================================================
function Lobby({ user, onCreateNew, onJoinRoom }) {
  const [code, setCode] = useState('');
  const [tab, setTab] = useState('join');

  const recent = [
    { id: 'BRD-2814', title: 'Q3 board agenda priorities', status: 'closed', when: '2 days ago' },
    { id: 'ENG-237', title: 'Hybrid working policy — 2026 H1', status: 'open', when: 'now' },
    { id: 'GOV-104', title: 'Bylaws amendment — voting rules', status: 'open', when: '4h ago' },
  ];

  function handleJoin(roomId) {
    onJoinRoom(roomId);
  }

  return (
    <div style={{minHeight: '100vh', background: 'var(--cream)'}}>
      <header style={{padding: '20px 40px', borderBottom: '1.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div className="brand" style={{gap: 12}}>
          <Brandmark/>
          <Wordmark/>
        </div>
        <div className="row" style={{'--gap': '14px'}}>
          <div className="label">Signed in as</div>
          <div className="row" style={{'--gap': '10px'}}>
            <div className="avatar you sm">{user.username[0].toUpperCase()}</div>
            <span style={{fontWeight: 600, fontSize: 14}}>{user.username}</span>
          </div>
        </div>
      </header>

      <main style={{maxWidth: 1100, margin: '0 auto', padding: '56px 40px'}}>
        <div className="label">STEP 02 · LOBBY</div>
        <h1 className="display" style={{fontSize: 64, margin: '14px 0 12px', maxWidth: 760}}>
          Pick a room.<br/>Or call one to order.
        </h1>
        <p className="lede" style={{maxWidth: 560, margin: '0 0 48px'}}>
          Join a meeting in progress with a room code, or open a new one as facilitator.
        </p>

        <div style={{display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28}}>
          {/* JOIN */}
          <section className="card" style={{padding: 32}}>
            <div className="section-head">
              <div className="label">JOIN AN EXISTING ROOM</div>
              <hr className="rule"/>
            </div>
            <p className="body" style={{margin: '0 0 20px'}}>
              Enter the 6-character room code given to you by the facilitator.
            </p>
            <div style={{display: 'flex', gap: 10}}>
              <input
                className="input mono"
                style={{textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600}}
                placeholder="XXX-NNNN"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
              <button className="btn btn-ink" disabled={code.length < 5} onClick={() => handleJoin(code)}>
                Join <Icon.ArrowRight/>
              </button>
            </div>

            <hr className="rule" style={{margin: '32px 0 20px'}}/>
            <div className="label" style={{marginBottom: 14}}>YOUR RECENT ROOMS</div>
            <div className="stack" style={{'--gap': '0'}}>
              {recent.map((r, i) => (
                <div key={r.id}>
                  {i > 0 && <hr className="rule"/>}
                  <button
                    onClick={() => handleJoin(r.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '16px 0', background: 'transparent', border: 0,
                      width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit'
                    }}
                  >
                    <div className="mono" style={{fontSize: 12, color: 'var(--muted)', width: 80, letterSpacing: '0.1em'}}>{r.id}</div>
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: 600, fontSize: 14}}>{r.title}</div>
                      <div className="label" style={{marginTop: 2, fontSize: 10}}>{r.when}</div>
                    </div>
                    <span className={'pill ' + (r.status === 'open' ? 'live' : 'locked')}>
                      <span className="dot"></span>{r.status}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* CREATE */}
          <section className="card ink" style={{padding: 32, position: 'relative', overflow: 'hidden'}}>
            <div style={{position: 'absolute', right: -60, bottom: -60, width: 200, height: 200, border: '1.5px solid rgba(243,236,217,0.08)', borderRadius: '50%'}}></div>
            <div style={{position: 'absolute', right: 20, bottom: 20, width: 80, height: 80, border: '1.5px solid rgba(243,236,217,0.08)', borderRadius: '50%'}}></div>
            <div style={{position: 'relative'}}>
              <div className="label on-navy">FACILITATE</div>
              <h2 className="h2" style={{color: 'var(--cream)', margin: '14px 0 12px', fontSize: 32, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '-0.035em'}}>
                Open a new motion.
              </h2>
              <p className="body" style={{color: 'rgba(243,236,217,0.75)', margin: '0 0 28px'}}>
                You'll be the admin. Set the agenda, define what consensus means, invite participants by code.
              </p>
              <button className="btn btn-primary btn-lg" onClick={onCreateNew}>
                <Icon.Plus/> Create a room
              </button>
              <hr className="rule" style={{margin: '32px 0 16px', background: 'rgba(243,236,217,0.15)'}}/>
              <ul style={{listStyle: 'none', padding: 0, margin: 0, color: 'rgba(243,236,217,0.7)', fontSize: 13, lineHeight: 1.7}}>
                <li>· Up to 24 participants per room</li>
                <li>· Live consensus tracking</li>
                <li>· Export minutes as Markdown</li>
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// ============================================================
// 3. CREATE ROOM
// ============================================================
function CreateRoom({ user, onBack, onCreated }) {
  const [template, setTemplate] = useState('debate'); // default per spec
  const [agenda, setAgenda] = useState('');
  const [criteria, setCriteria] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [openPopover, setOpenPopover] = useState(null);

  // Click outside closes popovers
  const wrapRef = useRef(null);
  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpenPopover(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (!agenda.trim() || !criteria.trim()) return;
    onCreated({ template, agenda: agenda.trim(), criteria: criteria.trim(), maxParticipants });
  }

  function loadExample() {
    setAgenda('Hybrid working policy — 2026 H1\n\nDetermine a shared minimum-days-in-office expectation across the engineering org, accounting for team rituals, parent schedules, and individual focus needs.');
    setCriteria('All four participants must explicitly agree on (a) a minimum number of days, and (b) whether those days are fixed company-wide or chosen per team. The agreement must include a quarterly review clause.');
  }

  return (
    <div ref={wrapRef} style={{minHeight: '100vh', background: 'var(--cream)'}}>
      <header style={{padding: '20px 40px', borderBottom: '1.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div className="brand" style={{gap: 12}}>
          <Brandmark/>
          <Wordmark/>
        </div>
        <button className="btn btn-soft btn-sm" onClick={onBack}>← Back to lobby</button>
      </header>

      <main style={{maxWidth: 880, margin: '0 auto', padding: '48px 40px 96px'}}>
        <div className="label">STEP 03 · NEW ROOM</div>
        <h1 className="display" style={{fontSize: 56, margin: '14px 0 12px'}}>
          What needs<br/>deciding?
        </h1>
        <p className="lede" style={{margin: '0 0 12px', maxWidth: 560}}>
          Two questions. They become the constitution of the room.
        </p>
        <button onClick={loadExample} className="btn btn-soft btn-xs" style={{marginBottom: 40}}>
          <Icon.Eye/> Try with an example
        </button>

        <form onSubmit={handleSubmit} className="stack" style={{'--gap': '32px'}}>
          {/* TEMPLATE PICKER */}
          <div className="field-with-help">
            <div style={{display: 'flex', alignItems: 'center'}}>
              <label className="field-label" style={{marginBottom: 0}}>Meeting template</label>
              <button
                type="button"
                className="help-trigger"
                onClick={(e) => { e.stopPropagation(); setOpenPopover(p => p === 'template' ? null : 'template'); }}
              >?</button>
              {openPopover === 'template' && (
                <div className="popover" style={{top: 32, left: 0}}>
                  <div className="label on-navy">TEMPLATES</div>
                  Templates change the <strong style={{color: 'var(--cream)'}}>shape of the live summary</strong>, the label set the mediator uses, and the chip under each chat message. The conversation itself works the same way regardless.
                </div>
              )}
            </div>
            <p className="body" style={{margin: '4px 0 14px', fontSize: 13, color: 'var(--muted)'}}>
              Pick the shape this meeting wants to take. You can switch later from the admin menu.
            </p>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10}}>
              {window.TEMPLATE_ORDER.map((key) => {
                const t = window.TEMPLATES[key];
                const on = template === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTemplate(key)}
                    className="card"
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: '14px 16px',
                      borderColor: on ? 'var(--navy)' : undefined,
                      borderWidth: on ? 2 : undefined,
                      background: on ? '#fff' : undefined,
                      fontFamily: 'inherit',
                      transition: 'all 0.14s',
                      position: 'relative',
                    }}
                  >
                    <div className="row" style={{'--gap': '10px', marginBottom: 8}}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 4,
                        background: on ? 'var(--navy)' : 'var(--cream-2)',
                        color: on ? 'var(--cream)' : 'var(--navy)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'Archivo', fontWeight: 800, fontSize: 13, letterSpacing: '-0.02em',
                      }}>{t.icon}</div>
                      <span style={{fontWeight: 700, fontSize: 14, letterSpacing: '-0.015em'}}>{t.name}</span>
                      {on && <span style={{marginLeft: 'auto'}}><Icon.Check style={{color: 'var(--rust)', width: 16, height: 16}}/></span>}
                    </div>
                    <p style={{margin: 0, fontSize: 12.5, lineHeight: 1.4, color: 'var(--muted)'}}>{t.tagline}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AGENDA */}
          <div className="field-with-help">
            <div style={{display: 'flex', alignItems: 'center', marginBottom: 0}}>
              <label className="field-label" style={{marginBottom: 0}}>
                Agenda
              </label>
              <button
                type="button"
                className="help-trigger"
                onClick={(e) => { e.stopPropagation(); setOpenPopover(p => p === 'agenda' ? null : 'agenda'); }}
                aria-label="What's a good agenda?"
              >?</button>
              {openPopover === 'agenda' && (
                <div className="popover" style={{top: 32, left: 0}}>
                  <div className="label on-navy">A GOOD AGENDA</div>
                  States <strong style={{color: 'var(--cream)'}}>what you're deciding</strong>, not just the topic. Give just enough context for someone joining cold to understand the stakes.
                  <ul>
                    <li><b>Yes:</b> "Decide whether to ship the v3 redesign before Q4 or delay to Q1."</li>
                    <li><b>No:</b> "Talk about v3."</li>
                  </ul>
                </div>
              )}
            </div>
            <p className="body" style={{margin: '4px 0 12px', fontSize: 13, color: 'var(--muted)'}}>
              What is this meeting actually trying to settle? Stay concrete.
            </p>
            <textarea
              className="textarea"
              rows="4"
              placeholder="e.g. Decide on the minimum days-per-week expectation for in-office work, effective H1 2026."
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
            />
          </div>

          {/* CRITERIA */}
          <div className="field-with-help">
            <div style={{display: 'flex', alignItems: 'center'}}>
              <label className="field-label" style={{marginBottom: 0}}>
                Evaluation criteria
              </label>
              <button
                type="button"
                className="help-trigger"
                onClick={(e) => { e.stopPropagation(); setOpenPopover(p => p === 'criteria' ? null : 'criteria'); }}
                aria-label="How do I write evaluation criteria?"
              >?</button>
              {openPopover === 'criteria' && (
                <div className="popover" style={{top: 32, left: 0}}>
                  <div className="label on-navy">CRITERIA = "DONE"</div>
                  Describes how we'd know consensus has been <strong style={{color: 'var(--cream)'}}>reached</strong>. The mediator uses this to evaluate every contribution and to mark the meeting complete.
                  <ul>
                    <li>Be specific about <b>who</b> must agree (all? quorum? specific roles?)</li>
                    <li>Name the <b>thing</b> they're agreeing on</li>
                    <li>Include any <b>follow-ups</b> the agreement must specify</li>
                  </ul>
                </div>
              )}
            </div>
            <p className="body" style={{margin: '4px 0 12px', fontSize: 13, color: 'var(--muted)'}}>
              What does "we agree" look like in this room? Consensus closes when this is satisfied.
            </p>
            <textarea
              className="textarea"
              rows="4"
              placeholder="e.g. All four participants explicitly agree on (a) a minimum number of days and (b) whether those days are fixed or chosen per team."
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
            />
          </div>

          {/* MAX PARTICIPANTS */}
          <div>
            <div style={{display: 'flex', alignItems: 'center'}}>
              <label className="field-label" style={{marginBottom: 0}}>Max participants</label>
              <button
                type="button"
                className="help-trigger"
                onClick={(e) => { e.stopPropagation(); setOpenPopover(p => p === 'max' ? null : 'max'); }}
              >?</button>
              {openPopover === 'max' && (
                <div className="popover" style={{top: 32, left: 0}}>
                  Hard cap on who can join via the code. After you lock the room, no one new can enter regardless of cap.
                </div>
              )}
            </div>
            <p className="body" style={{margin: '4px 0 12px', fontSize: 13, color: 'var(--muted)'}}>
              Small rooms reach consensus faster. 4–8 is the sweet spot.
            </p>
            <div className="row" style={{'--gap': '8px'}}>
              {[2, 4, 6, 8, 12, 24].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxParticipants(n)}
                  className={'btn btn-sm ' + (maxParticipants === n ? 'btn-ink' : 'btn-soft')}
                  style={{minWidth: 56}}
                >{n}</button>
              ))}
            </div>
          </div>

          <hr className="rule"/>

          <div className="row" style={{justifyContent: 'space-between'}}>
            <div>
              <div className="label">YOU WILL BE</div>
              <div className="row" style={{'--gap': '10px', marginTop: 8}}>
                <div className="avatar you">{user.username[0].toUpperCase()}</div>
                <div>
                  <div style={{fontWeight: 700, fontSize: 15}}>{user.username}</div>
                  <div className="label" style={{fontSize: 10, marginTop: 2}}>FACILITATOR · ADMIN</div>
                </div>
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={!agenda.trim() || !criteria.trim()}
            >
              Open the room <Icon.ArrowRight/>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

// ============================================================
// 4. END SCREEN — reuses the summary view, no chat
// ============================================================
function EndScreen({ user, room, onBackToLobby }) {
  const [downloaded, setDownloaded] = useState(false);

  const summaryMd = buildSummaryMarkdown(room);

  function handleDownload() {
    const blob = new Blob([summaryMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consensus-${room.code}-minutes.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  function handlePreview() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<pre style="font-family: ui-monospace, monospace; padding: 40px; max-width: 760px; margin: 0 auto; line-height: 1.5; white-space: pre-wrap;">${summaryMd.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>`);
    w.document.title = `Minutes · ${room.code}`;
  }

  return (
    <div className="room" data-screen-label="07 End">
      <div className="room-header">
        <div className="brand" style={{gap: 12}}>
          <Brandmark/>
          <Wordmark/>
        </div>
        <div style={{width: 1, height: 24, background: 'var(--line)'}}></div>
        <div style={{flex: 1, minWidth: 0}}>
          <div className="label">ROOM · {room.code} · CLOSED</div>
          <div style={{fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
            {room.agendaTitle}
          </div>
        </div>
        <span className="pill locked lg"><span className="dot"></span> Meeting closed</span>
        <button className="btn btn-soft btn-sm" onClick={onBackToLobby}>← Lobby</button>
      </div>

      <div style={{overflow: 'auto', background: 'var(--cream)'}}>
        <div className="summary-doc">
          <div className="doc-banner closed">
            <div style={{width: 48, height: 48, background: 'rgba(243,236,217,0.15)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto'}}>
              <Icon.Check style={{width: 22, height: 22}}/>
            </div>
            <div style={{flex: 1}}>
              <div className="bigtext">Consensus reached · meeting adjourned</div>
              <div className="subtext">Closed by {room.adminName} at {new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} · {room.participants.length} participants · {room.duration}</div>
            </div>
            <div className="row" style={{'--gap': '10px'}}>
              <button className="btn btn-soft btn-sm" style={{borderColor: 'rgba(243,236,217,0.3)', color: 'var(--cream)'}} onClick={handlePreview}>
                <Icon.Eye/> Preview
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                <Icon.Download/> {downloaded ? 'Downloaded' : 'Download .md'}
              </button>
            </div>
          </div>

          <div className="doc-head">
            <div className="label">MINUTES · {room.code}</div>
            <h1 className="doc-title">{room.agendaTitle}</h1>
            <div className="doc-meta">
              <div>
                <span className="label">FACILITATOR</span>
                <span style={{fontWeight: 600, fontSize: 14}}>{room.adminName}</span>
              </div>
              <div>
                <span className="label">PARTICIPANTS</span>
                <span style={{fontWeight: 600, fontSize: 14}}>{room.participants.length} present</span>
              </div>
              <div>
                <span className="label">DURATION</span>
                <span style={{fontWeight: 600, fontSize: 14}}>{room.duration}</span>
              </div>
              <div>
                <span className="label">OUTCOME</span>
                <span style={{fontWeight: 600, fontSize: 14, color: 'var(--ok)'}}>Consensus reached</span>
              </div>
            </div>
          </div>

          {/* render every section from final summary */}
          {room.summary.map((s, i) => (
            <section key={i}>
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

          <hr className="rule heavy" style={{margin: '40px 0 20px'}}/>
          <div className="label" style={{textAlign: 'center'}}>
            END OF MINUTES · CONSENSUS · {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

// helper used by EndScreen — build a markdown export
function buildSummaryMarkdown(room) {
  const lines = [];
  lines.push(`# ${room.agendaTitle}`);
  lines.push('');
  lines.push(`**Room:** ${room.code}`);
  lines.push(`**Facilitator:** ${room.adminName}`);
  lines.push(`**Participants:** ${room.participants.map(p => p.name).join(', ')}`);
  lines.push(`**Duration:** ${room.duration}`);
  lines.push(`**Outcome:** Consensus reached`);
  lines.push('');
  lines.push('---');
  lines.push('');
  room.summary.forEach((s, i) => {
    lines.push(`## ${String(i + 1).padStart(2, '0')} · ${s.heading}`);
    lines.push('');
    if (s.kind === 'list') {
      s.items.forEach(it => {
        lines.push(`- ${it.role ? `**${it.role}:** ` : ''}${it.text}`);
      });
    } else {
      lines.push(s.body);
    }
    if (s.agreement) {
      lines.push('');
      lines.push(`> *${s.agreement}*`);
    }
    lines.push('');
  });
  lines.push('---');
  lines.push(`*Minutes generated by Consensus · ${new Date().toLocaleString()}*`);
  return lines.join('\n');
}

// Export to global scope so other Babel scripts can use them.
Object.assign(window, {
  Icon, Brandmark, Wordmark, BrandLockup,
  Signup, Lobby, CreateRoom, EndScreen,
  buildSummaryMarkdown,
});
