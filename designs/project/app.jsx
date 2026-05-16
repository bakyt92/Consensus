// app.jsx — root state + screen routing + tweaks panel

const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "startAt": "signup",
  "role": "admin",
  "palette": "civic",
  "template": "negotiation",
  "voiceModeDefault": false,
  "showFilteredMessages": true
}/*EDITMODE-END*/;

// Palette swap definitions — applied as CSS variables on :root
const PALETTES = {
  civic:   { '--navy': '#11243a', '--navy-2': '#1a3050', '--cream': '#f3ecd9', '--rust': '#c54d2c', '--rust-deep': '#a23e22' },
  forest:  { '--navy': '#1d3a2d', '--navy-2': '#264a3b', '--cream': '#f0ecdd', '--rust': '#c47a2c', '--rust-deep': '#a26222' },
  oxblood: { '--navy': '#3a1414', '--navy-2': '#4f1c1c', '--cream': '#f1e8d5', '--rust': '#c2a14a', '--rust-deep': '#9d8038' },
  slate:   { '--navy': '#22262e', '--navy-2': '#2e333d', '--cream': '#ece8df', '--rust': '#7f8ea3', '--rust-deep': '#5f6e83' },
};

// For the TweakColor swatch picker (it expects hex arrays). Order MUST match PALETTE_KEYS.
const PALETTE_KEYS    = ['civic', 'forest', 'oxblood', 'slate'];
const PALETTE_SWATCHES = [
  ['#11243a', '#f3ecd9', '#c54d2c'],
  ['#1d3a2d', '#f0ecdd', '#c47a2c'],
  ['#3a1414', '#f1e8d5', '#c2a14a'],
  ['#22262e', '#ece8df', '#7f8ea3'],
];

function applyPalette(name) {
  const p = PALETTES[name] || PALETTES.civic;
  const root = document.documentElement;
  Object.entries(p).forEach(([k, v]) => root.style.setProperty(k, v));
}

// Seed room used everywhere
function seedRoom(adminName, template = 'negotiation') {
  return {
    code: 'ENG-237',
    template,
    agendaTitle: 'Hybrid working policy — 2026 H1',
    agenda: 'Determine a shared minimum-days-in-office expectation across the engineering org, accounting for team rituals, parent schedules, and individual focus needs.',
    criteria: 'All four participants must explicitly agree on (a) a minimum number of in-office days and (b) whether those days are fixed company-wide or chosen per team. The agreement must include a quarterly review clause.',
    adminName: adminName,
    duration: '14m',
    maxParticipants: 8,
    participants: [
      { id: 'p1', name: adminName, initials: adminName[0].toUpperCase(), role: 'Facilitator · Eng Lead', state: 'online', isYou: true },
      { id: 'p2', name: 'Jordan',  initials: 'JS', role: 'Engineering Manager', state: 'online' },
      { id: 'p3', name: 'Priya',   initials: 'PR', role: 'Staff Engineer',      state: 'online' },
      { id: 'p4', name: 'Sam',     initials: 'SK', role: 'Platform Lead',       state: 'online' },
    ],
  };
}

function App() {
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Initial screen comes from a tweak (so user can jump to any screen from the panel)
  const [screen, setScreen] = useStateA(tweaks.startAt || 'signup');
  const [user, setUser] = useStateA({ email: '', username: 'Maya' });
  const [room, setRoom] = useStateA(null);
  const [finalRoom, setFinalRoom] = useStateA(null);
  const [voiceMode, setVoiceMode] = useStateA(!!tweaks.voiceModeDefault);

  // When startAt tweak changes (user jumps via panel), bounce to that screen.
  useEffectA(() => {
    if (tweaks.startAt && tweaks.startAt !== screen) {
      // If jumping to a screen that needs setup, prime defaults
      if (tweaks.startAt !== 'signup' && !user.username) setUser({ email: 'maya@nestcentre.org', username: 'Maya' });
      if (['create', 'room', 'end'].includes(tweaks.startAt) && !room) {
        setRoom(seedRoom(user.username || 'Maya'));
      }
      if (tweaks.startAt === 'end' && !finalRoom) {
        // build a "closed" room with full summary so end screen renders meaningfully
        const seeded = seedRoom(user.username || 'Maya');
        const fakeRoom = buildClosedRoomFromTurns(seeded);
        setFinalRoom(fakeRoom);
      }
      setScreen(tweaks.startAt);
    }
    // eslint-disable-next-line
  }, [tweaks.startAt]);

  // Palette
  useEffectA(() => { applyPalette(tweaks.palette || 'civic'); }, [tweaks.palette]);

  // Template switch — propagate the tweak into the active room so the
  // center pane re-renders against the new visualization immediately.
  useEffectA(() => {
    if (room && tweaks.template && tweaks.template !== room.template) {
      setRoom({ ...room, template: tweaks.template });
    }
    // eslint-disable-next-line
  }, [tweaks.template]);

  // ---- screen transitions
  function handleSignup({ email, username }) {
    setUser({ email, username });
    setScreen('lobby');
  }
  function handleCreate() {
    setScreen('create');
  }
  function handleJoinRoom(code) {
    // For prototype: any code = the seeded room
    const r = seedRoom(user.username || 'Maya');
    r.code = code;
    setRoom(r);
    setScreen('room');
  }
  function handleCreated({ template, agenda, criteria, maxParticipants }) {
    const code = 'C-' + Math.floor(1000 + Math.random() * 8999);
    const seeded = seedRoom(user.username || 'Maya', template || 'debate');
    seeded.agenda = agenda;
    seeded.criteria = criteria;
    // Pull a quick title from first non-empty line of agenda
    seeded.agendaTitle = agenda.split('\n')[0].slice(0, 80) || 'New motion';
    seeded.maxParticipants = maxParticipants;
    seeded.code = code;
    setRoom(seeded);
    setScreen('room');
  }
  function handleCloseMeeting({ messages, summary, consensus, premature }) {
    setFinalRoom({ ...room, summary, finalConsensus: consensus, premature });
    setScreen('end');
  }
  function handleBackToLobby() {
    setRoom(null); setFinalRoom(null);
    setScreen('lobby');
  }

  const isAdmin = tweaks.role !== 'participant';

  return (
    <>
      {screen === 'signup' && <Signup onSubmit={handleSignup} />}
      {screen === 'lobby' && <Lobby user={user} onCreateNew={handleCreate} onJoinRoom={handleJoinRoom} />}
      {screen === 'create' && <CreateRoom user={user} onBack={() => setScreen('lobby')} onCreated={handleCreated} />}
      {screen === 'room' && room && (
        <Room
          user={user}
          room={room}
          isAdmin={isAdmin}
          voiceMode={voiceMode}
          setVoiceMode={setVoiceMode}
          onCloseMeeting={handleCloseMeeting}
          onLeave={handleBackToLobby}
        />
      )}
      {screen === 'end' && finalRoom && (
        <EndScreen user={user} room={finalRoom} onBackToLobby={handleBackToLobby} />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Demo navigation">
          <TweakSelect
            label="Jump to screen"
            value={tweaks.startAt}
            onChange={(v) => setTweak('startAt', v)}
            options={[
              { value: 'signup', label: '1 · Sign up' },
              { value: 'lobby',  label: '2 · Lobby' },
              { value: 'create', label: '3 · Create room' },
              { value: 'room',   label: '4 · Room (live)' },
              { value: 'end',    label: '5 · Closed / export' },
            ]}
          />
          <TweakRadio
            label="Your role"
            value={tweaks.role}
            onChange={(v) => setTweak('role', v)}
            options={[
              { value: 'admin',       label: 'Facilitator' },
              { value: 'participant', label: 'Participant' },
            ]}
          />
        </TweakSection>

        <TweakSection label="Brand">
          <TweakColor
            label="Palette"
            value={PALETTE_SWATCHES[Math.max(0, PALETTE_KEYS.indexOf(tweaks.palette))]}
            onChange={(arr) => {
              const key = JSON.stringify(arr);
              const idx = PALETTE_SWATCHES.findIndex(p => JSON.stringify(p) === key);
              setTweak('palette', PALETTE_KEYS[idx] || 'civic');
            }}
            options={PALETTE_SWATCHES}
          />
        </TweakSection>

        <TweakSection label="Room behaviour">
          <TweakSelect
            label="Template (live)"
            value={tweaks.template}
            onChange={(v) => setTweak('template', v)}
            options={[
              { value: 'debate',      label: 'Debate' },
              { value: 'brainstorm',  label: 'Brainstorm' },
              { value: 'standup',     label: 'Stand-up' },
              { value: 'retro',       label: 'Retrospective' },
              { value: 'negotiation', label: 'Negotiation / Mediation' },
            ]}
          />
          <TweakToggle
            label="Voice mode default (auto-TTS)"
            value={tweaks.voiceModeDefault}
            onChange={(v) => { setTweak('voiceModeDefault', v); setVoiceMode(v); }}
          />
          <TweakToggle
            label="Show filtered messages"
            value={tweaks.showFilteredMessages}
            onChange={(v) => setTweak('showFilteredMessages', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// Helper for jumping straight to the end screen with a fully-built summary
function buildClosedRoomFromTurns(seed) {
  // simulate running all turns
  let summary = [
    { heading: 'Agenda', kind: 'body', body: seed.agenda },
    { heading: 'Evaluation criteria', kind: 'body', body: seed.criteria, agreement: '✓ All conditions satisfied.' },
  ];
  // bind agenda/criteria onto TURNS
  window.TURNS.forEach(t => { t._agenda = seed.agenda; t._criteria = seed.criteria; });
  window.TURNS.forEach((t, i) => {
    const out = t.apply(t.suggestions[0]);
    summary = out.newSummary;
  });
  return { ...seed, summary, finalConsensus: 88, premature: false };
}

ReactDOM.createRoot(document.getElementById('app-root')).render(<App />);
