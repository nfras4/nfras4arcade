<script lang="ts">
  import { goto } from '$app/navigation';

  // Tutorial state
  type TutorialPhase = 'intro' | 'role_reveal' | 'hints' | 'voting' | 'reveal' | 'done';

  const BOT_NAMES = ['Tutorial Bot A', 'Tutorial Bot B', 'Tutorial Bot C'];
  const WORD = 'Pizza';
  const CATEGORY = 'Food & Drinks';
  const IMPOSTOR_HINT = 'Something you eat';

  // Scripted bot hints (for when player is word-knower)
  const WORD_KNOWER_BOT_HINTS = [
    ['Cheese on top', 'Round shape', 'Italian origin'],
    ['Delivery is popular', 'Comes in a box', 'Many toppings'],
  ];
  // Bot hints when player is impostor (vaguer to simulate real play)
  const IMPOSTOR_BOT_HINTS = [
    ['Very common', 'People love it', 'Great with friends'],
    ['Available everywhere', 'Many varieties', 'A classic choice'],
  ];

  let phase = $state<TutorialPhase>('intro');
  let playerRole = $state<'player' | 'impostor'>('player');
  let hintRound = $state(0);
  let currentBotHintIndex = $state(0);
  let botHints = $state<{ name: string; text: string }[]>([]);
  let playerHint = $state('');
  let playerHasHinted = $state(false);
  let allHints = $state<{ name: string; text: string }[][]>([]);
  let botVotes = $state<{ voter: string; target: string }[]>([]);
  let playerVote = $state<string | null>(null);
  let revealExplanation = $state('');
  let animatingBot = $state<string | null>(null);

  function startTutorial() {
    // 50/50 random role
    const rand = crypto.getRandomValues(new Uint8Array(1))[0];
    playerRole = rand < 128 ? 'player' : 'impostor';
    phase = 'role_reveal';
  }

  function proceedToHints() {
    hintRound = 1;
    currentBotHintIndex = 0;
    botHints = [];
    playerHasHinted = false;
    phase = 'hints';
    scheduleBotHint();
  }

  function scheduleBotHint() {
    if (currentBotHintIndex >= BOT_NAMES.length) return;
    const botName = BOT_NAMES[currentBotHintIndex];
    animatingBot = botName;
    const delay = 2000 + Math.random() * 1000;
    setTimeout(() => {
      const hints = playerRole === 'player' ? WORD_KNOWER_BOT_HINTS : IMPOSTOR_BOT_HINTS;
      const roundHints = hints[hintRound - 1] || hints[0];
      botHints = [...botHints, { name: botName, text: roundHints[currentBotHintIndex] }];
      animatingBot = null;
      currentBotHintIndex++;
      if (currentBotHintIndex < BOT_NAMES.length) {
        scheduleBotHint();
      }
    }, delay);
  }

  function submitHint() {
    if (!playerHint.trim()) return;
    botHints = [...botHints, { name: 'You', text: playerHint.trim() }];
    playerHint = '';
    playerHasHinted = true;
  }

  let allHintsDone = $derived(currentBotHintIndex >= BOT_NAMES.length && playerHasHinted);

  function finishHintRound() {
    allHints = [...allHints, [...botHints]];
    if (hintRound < 2) {
      hintRound++;
      currentBotHintIndex = 0;
      botHints = [];
      playerHasHinted = false;
      scheduleBotHint();
    } else {
      phase = 'voting';
    }
  }

  function vote(target: string) {
    playerVote = target;
    // Bots vote randomly but never for the real player
    const botTargets = [...BOT_NAMES];
    botVotes = BOT_NAMES.map(botName => {
      const others = botTargets.filter(n => n !== botName);
      const idx = crypto.getRandomValues(new Uint8Array(1))[0] % others.length;
      return { voter: botName, target: others[idx] };
    });

    // Determine result
    setTimeout(() => {
      if (playerRole === 'impostor') {
        revealExplanation = `You were the Impostor! The word was "${WORD}" but you only saw the hint "${IMPOSTOR_HINT}". In a real game, if the group votes for you, they win. If they don't, you win! The bots voted randomly this time, so the result doesn't matter — what matters is learning to blend in.`;
      } else {
        revealExplanation = `You were a word-knower! The word was "${WORD}" and you knew it. The Impostor only saw "${IMPOSTOR_HINT}" and had to bluff. In a real game, your goal is to give hints that prove you know the word without making it too obvious for the Impostor to guess.`;
      }
      phase = 'reveal';
    }, 1500);
  }

  function finish() {
    phase = 'done';
  }
</script>

<!-- Tutorial banner -->
<div class="tutorial-banner">
  This is a practice round — nothing is saved
</div>

<div class="tutorial-page">
  <div class="tutorial-content">

    <!-- INTRO -->
    {#if phase === 'intro'}
      <div class="phase-panel fade-in">
        <header class="hero">
          <div class="title-frame">
            <span class="diamond-accent" aria-hidden="true"></span>
            <h1 class="wordmark geo-title">Impostor</h1>
            <span class="diamond-accent" aria-hidden="true"></span>
          </div>
          <p class="tagline">How to play — Interactive Tutorial</p>
        </header>

        <div class="panel">
          <div class="panel-border" aria-hidden="true"></div>
          <div class="panel-inner">
            <p class="desc">You'll play a practice round with 3 bots. You'll be randomly assigned as either a <strong>word-knower</strong> or the <strong>Impostor</strong>.</p>
            <ol class="tutorial-steps">
              <li>Everyone sees a category. Word-knowers see the secret word. The Impostor sees only a vague hint.</li>
              <li>Take turns giving clues — subtle enough to avoid helping the Impostor, clear enough to prove you know.</li>
              <li>After 2 rounds of hints, vote on who you think the Impostor is.</li>
            </ol>
            <button class="btn-primary btn-full" onclick={startTutorial}>Start Tutorial</button>
          </div>
        </div>
      </div>

    <!-- ROLE REVEAL -->
    {:else if phase === 'role_reveal'}
      <div class="phase-panel fade-in">
        <h2 class="geo-title phase-title">Your Role</h2>
        <div class="panel">
          <div class="panel-border" aria-hidden="true"></div>
          <div class="panel-inner role-panel">
            <div class="role-badge" class:impostor={playerRole === 'impostor'}>
              {playerRole === 'impostor' ? 'IMPOSTOR' : 'WORD-KNOWER'}
            </div>
            <p class="role-category"><span class="label">Category:</span> {CATEGORY}</p>
            {#if playerRole === 'impostor'}
              <p class="role-info">You only see a hint: <strong>"{IMPOSTOR_HINT}"</strong></p>
              <p class="role-tip">Try to blend in! Give hints that sound like you know the word.</p>
            {:else}
              <p class="role-info">The word is: <strong>"{WORD}"</strong></p>
              <p class="role-tip">Give hints that prove you know — but don't make it too obvious!</p>
            {/if}
            <button class="btn-primary btn-full" onclick={proceedToHints}>Continue to Hints</button>
          </div>
        </div>
      </div>

    <!-- HINTS -->
    {:else if phase === 'hints'}
      <div class="phase-panel fade-in">
        <h2 class="geo-title phase-title">Hint Round {hintRound} of 2</h2>

        <div class="hints-list">
          {#each botHints as hint}
            <div class="hint-item">
              <span class="hint-name">{hint.name}</span>
              <span class="hint-text">"{hint.text}"</span>
            </div>
          {/each}
          {#if animatingBot}
            <div class="hint-item thinking">
              <span class="hint-name">{animatingBot}</span>
              <span class="hint-text thinking-dots">thinking...</span>
            </div>
          {/if}
        </div>

        {#if currentBotHintIndex >= BOT_NAMES.length && !playerHasHinted}
          <div class="hint-input-area">
            <label class="field-label" for="hint-input">Your hint</label>
            <input
              id="hint-input"
              bind:value={playerHint}
              placeholder="Type your hint..."
              class="hint-input"
              maxlength="100"
              onkeydown={(e) => { if (e.key === 'Enter') submitHint(); }}
            />
            <button class="btn-primary" onclick={submitHint} disabled={!playerHint.trim()}>
              Submit Hint
            </button>
          </div>
        {/if}

        {#if allHintsDone}
          <button class="btn-primary btn-full" onclick={finishHintRound}>
            {hintRound < 2 ? 'Next Hint Round' : 'Proceed to Voting'}
          </button>
        {/if}
      </div>

    <!-- VOTING -->
    {:else if phase === 'voting'}
      <div class="phase-panel fade-in">
        <h2 class="geo-title phase-title">Vote: Who is the Impostor?</h2>

        <!-- Show all hints for reference -->
        <div class="all-hints-recap">
          {#each allHints as roundHints, ri}
            <div class="round-recap">
              <span class="round-label geo-title">Round {ri + 1}</span>
              {#each roundHints as hint}
                <div class="hint-item compact">
                  <span class="hint-name">{hint.name}</span>
                  <span class="hint-text">"{hint.text}"</span>
                </div>
              {/each}
            </div>
          {/each}
        </div>

        {#if !playerVote}
          <div class="vote-options">
            {#each BOT_NAMES as bot}
              <button class="btn-secondary vote-btn" onclick={() => vote(bot)}>
                Vote for {bot}
              </button>
            {/each}
          </div>
        {:else}
          <p class="waiting-text">Counting votes...</p>
        {/if}
      </div>

    <!-- REVEAL -->
    {:else if phase === 'reveal'}
      <div class="phase-panel fade-in">
        <h2 class="geo-title phase-title">Round Results</h2>
        <div class="panel">
          <div class="panel-border" aria-hidden="true"></div>
          <div class="panel-inner">
            <div class="reveal-role">
              <span class="label">Your role:</span>
              <span class="role-badge small" class:impostor={playerRole === 'impostor'}>
                {playerRole === 'impostor' ? 'IMPOSTOR' : 'WORD-KNOWER'}
              </span>
            </div>
            <p class="reveal-word"><span class="label">The word was:</span> <strong>{WORD}</strong></p>
            <p class="reveal-explanation">{revealExplanation}</p>
            <button class="btn-primary btn-full" onclick={finish}>Got it!</button>
          </div>
        </div>
      </div>

    <!-- DONE -->
    {:else if phase === 'done'}
      <div class="phase-panel fade-in">
        <h2 class="geo-title phase-title">Tutorial Complete!</h2>
        <div class="panel">
          <div class="panel-border" aria-hidden="true"></div>
          <div class="panel-inner">
            <p class="desc">You're ready to play for real! Create or join a room to play with friends.</p>
            <div class="action-row">
              <button class="btn-primary btn-full" onclick={() => goto('/impostor')}>
                Play a Real Game
              </button>
              <button class="btn-secondary btn-full" onclick={() => goto('/')}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

  </div>
</div>

<style>
  .tutorial-banner {
    position: fixed;
    top: 3.5rem;
    left: 0;
    right: 0;
    z-index: 100;
    text-align: center;
    padding: 0.4rem 1rem;
    background: var(--accent-faint);
    border-bottom: 1px solid var(--accent-border);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .tutorial-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 6rem 1.25rem 4rem;
  }

  .tutorial-content {
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .hero { text-align: center; animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .wordmark {
    font-size: clamp(2rem, 8vw, 3.5rem);
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1;
    color: var(--accent);
    background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 60%, var(--accent-dim) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tagline {
    margin-top: 0.875rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .phase-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    animation: fadeUp 0.3s ease both;
  }

  .phase-title {
    font-size: 1.25rem;
    letter-spacing: 0.12em;
    color: var(--accent);
    text-align: center;
  }

  .panel {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    overflow: visible;
    position: relative;
  }

  .panel-border {
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
    pointer-events: none;
  }

  .panel-inner {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.5rem;
  }

  .desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .tutorial-steps {
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tutorial-steps li {
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .tutorial-steps li strong { color: var(--text); font-weight: 500; }

  .btn-full {
    width: 100%;
    padding: 0.875rem 1.25rem;
    font-size: 0.9375rem;
  }

  .action-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  /* Role reveal */
  .role-panel { text-align: center; }

  .role-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 0.5rem 1.25rem;
    background: var(--accent-faint);
    color: var(--accent);
    border: 1px solid var(--accent-border);
    border-radius: 4px;
    display: inline-block;
  }

  .role-badge.impostor {
    background: rgba(231, 76, 60, 0.1);
    color: #e74c3c;
    border-color: rgba(231, 76, 60, 0.3);
  }

  .role-badge.small {
    font-size: 0.8rem;
    padding: 0.25rem 0.75rem;
  }

  .role-category { font-size: 0.85rem; color: var(--text-muted); }
  .role-info { font-size: 0.9rem; color: var(--text); }
  .role-info strong { color: var(--accent); }
  .role-tip { font-size: 0.8rem; color: var(--text-subtle); font-style: italic; }

  .label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* Hints */
  .hints-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .hint-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .hint-item.compact {
    padding: 0.4rem 0.6rem;
  }

  .hint-item.thinking { opacity: 0.6; }

  .hint-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
    min-width: 90px;
    flex-shrink: 0;
  }

  .hint-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .thinking-dots {
    animation: blink 1.2s infinite;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    25% { opacity: 0.3; }
  }

  .hint-input-area {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--bg-card);
    border: 1px solid var(--accent-border);
    border-radius: 4px;
  }

  .field-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .hint-input {
    font-size: 0.9rem !important;
    padding: 0.75rem !important;
  }

  /* Voting */
  .all-hints-recap {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .round-recap {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .round-label {
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
    margin-bottom: 0.125rem;
  }

  .vote-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .vote-btn {
    padding: 0.875rem;
    font-size: 0.9rem;
  }

  .waiting-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* Reveal */
  .reveal-role {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }

  .reveal-word {
    font-size: 0.9rem;
    color: var(--text);
    text-align: center;
  }

  .reveal-word strong { color: var(--accent); font-size: 1.1rem; }

  .reveal-explanation {
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  @media (min-width: 480px) {
    .panel-inner { padding: 1.875rem; }
  }
</style>
