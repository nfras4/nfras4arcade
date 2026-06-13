<script lang="ts">
  import { FUR_COLOURS, type ExpressionName, EXPRESSION_POSES } from '$lib/table3d/core/rig.js';
  import { playChatBlips } from '$lib/table3d/chatAudio.js';
  import { voiceParamsFor } from '$lib/table3d/core/chatVoice.js';
  import { bandpassRms, createEnvelope, type Envelope } from '$lib/table3d/core/audioMeter.js';
  import ChatBubble from '$lib/table3d/ChatBubble.svelte';
  import ChatStageLog from '$lib/table3d/ChatStageLog.svelte';
  import SelfMonkeyPortrait from '$lib/table3d/SelfMonkeyPortrait.svelte';
  import PlaceholderMonkey from '$lib/table3d/PlaceholderMonkey.svelte';

  // ─── Page access control ─────────────────────────────────────────────────────
  // Accessible in two cases: (1) vite dev mode; (2) a `?voicetest=1` query
  // param on a deployed build, so Nick can test mic/voice on real hardware
  // where Permissions-Policy actually applies. Random visitors hitting
  // /dev/voice-test without the param get redirected home.
  let pageAccessible = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const optIn = new URL(window.location.href).searchParams.get('voicetest') === '1';
    if (!import.meta.env.DEV && !optIn) {
      window.location.href = '/';
      return;
    }
    pageAccessible = true;
  });

  // ─── Reduced-motion detection ────────────────────────────────────────────────
  const rmQuery =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  let reducedMotion = $state(rmQuery?.matches ?? false);

  $effect(() => {
    if (!rmQuery) return;
    const handler = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    rmQuery.addEventListener('change', handler);
    return () => rmQuery.removeEventListener('change', handler);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION A: Chat blip + bubble
  // ────────────────────────────────────────────────────────────────────────────

  let chatText = $state('');
  let chatFurColour = $state(FUR_COLOURS[0]);
  let bubbles = $state<Array<{ id: number; playerId: string; text: string; voice: ReturnType<typeof voiceParamsFor>; ts: number }>>([]);
  let logEntries = $state<Array<{ id: number; playerId: string; text: string; voice: ReturnType<typeof voiceParamsFor>; ts: number }>>([]);
  let bubbleCounter = $state(0);

  function sendChatMessage() {
    if (!chatText.trim()) return;

    const voice = voiceParamsFor(chatFurColour);
    const entry = {
      id: bubbleCounter++,
      playerId: 'me',
      text: chatText,
      voice,
      ts: Date.now(),
    };

    bubbles = [entry];
    logEntries = [...logEntries, entry].slice(-6);

    playChatBlips(chatText, voice);

    chatText = '';
  }

  let tvMode = $state(false);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION B: Self portrait isolation
  // ────────────────────────────────────────────────────────────────────────────

  let portraitFurColour = $state(FUR_COLOURS[0]);
  let portraitExpression = $state<ExpressionName>('neutral');
  let portraitTalkAmplitude = $state(0);

  const expressions = Object.keys(EXPRESSION_POSES) as ExpressionName[];

  function pulseAmplitude() {
    portraitTalkAmplitude = 0.7;
    setTimeout(() => {
      portraitTalkAmplitude = 0;
    }, 200);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION C: Mic + meter
  // ────────────────────────────────────────────────────────────────────────────

  let micStream: MediaStream | null = null;
  let micStatus = $state<'off' | 'granted' | 'denied' | string>('off');
  let micError = $state<string | null>(null);
  let micAmplitude = $state(0);
  let audioContext: AudioContext | null = null;
  let micEnvelope: Envelope | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function requestMic() {
    try {
      micError = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      micStream = stream;
      micStatus = 'granted';

      // Setup audio metering
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;

      source.connect(analyser);

      micEnvelope = createEnvelope({
        attack: 0.4,
        release: 0.15,
        gain: 2.5,
        reducedMotion,
      });

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      // Start polling
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        analyser.getByteFrequencyData(buffer);
        const rawRms = bandpassRms(
          buffer,
          audioContext!.sampleRate,
          analyser.fftSize,
          250,
          3500
        );
        micAmplitude = micEnvelope!.update(rawRms);
      }, 10);
    } catch (err: any) {
      micStatus = err.name || 'error';
      micError = err.message || String(err);
    }
  }

  function stopMic() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }

    micAmplitude = 0;
    micStatus = 'off';
    micError = null;
  }

  // Use $effect (not onMount) so the mic cleanup runs in both dev and prod
  // builds: per the project memory, onMount/onDestroy get tree-shaken in prod
  // and would leave the mic indicator on if the page were unmounted via the
  // ?voicetest=1 prod escape hatch.
  $effect(() => {
    return () => {
      stopMic();
      if (audioContext) {
        audioContext.close().catch(() => {});
      }
    };
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION D: Blip cadence reference
  // ────────────────────────────────────────────────────────────────────────────

  const cadenceText = 'hello monkeys';
  const cadenceSpeeds = [
    { cps: 12, label: '12 cps (slow)' },
    { cps: 18, label: '18 cps (default)' },
    { cps: 30, label: '30 cps (fast)' },
  ];

  function playCadenceDemo(cps: number) {
    const voice = voiceParamsFor('#666666');
    playChatBlips(cadenceText, voice);
  }
</script>

{#if !pageAccessible}
  <!-- Empty until dev mode confirmed -->
{:else}
  <div class="voice-test-harness">
    <header class="harness-header">
      <h1>Voice + chat test harness (dev only)</h1>
      <p>Tests every Phase 3 surface in isolation. No game, no socket, no rate limits. Production components rendered with controlled inputs.</p>

      <!-- Breadcrumb nav -->
      <nav class="breadcrumb-nav">
        <a href="/dev/monkey">Monkey test</a>
        <span class="breadcrumb-sep">/</span>
        <a href="/dev/table">Table test</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">Voice test</span>
      </nav>
    </header>

    <div class="content-grid">
      <!-- SECTION A: Chat blip + bubble -->
      <section class="test-card">
        <h2 class="card-title">Chat blip + bubble</h2>

        <div class="form-group">
          <label for="chat-input">Message (max 140 chars)</label>
          <input
            id="chat-input"
            bind:value={chatText}
            maxlength="140"
            type="text"
            placeholder="Type a message..."
          />
          <span class="char-count">{chatText.length}/140</span>
        </div>

        <div class="form-group">
          <label>Fur colour</label>
          <div class="colour-swatches">
            {#each FUR_COLOURS as colour}
              <button
                class="swatch"
                class:active={chatFurColour === colour}
                style="background-color: {colour}"
                onclick={() => (chatFurColour = colour)}
                aria-label="Select {colour}"
                title={colour}
              />
            {/each}
          </div>
        </div>

        <button class="send-btn" onclick={sendChatMessage}>Send</button>

        {#if bubbles.length > 0}
          <div class="bubble-preview-box">
            <div class="bubble-preview-label">Preview</div>
            {#key bubbles[0].id}
              <ChatBubble
                text={bubbles[0].text}
                voice={bubbles[0].voice}
                startTs={bubbles[0].ts}
                {reducedMotion}
              />
            {/key}
          </div>
        {/if}

        <div class="log-preview-box">
          <div class="log-preview-header">
            <span class="log-preview-label">Chat log (last 6)</span>
            <label class="tv-toggle">
              <input type="checkbox" bind:checked={tvMode} />
              <span>TV variant</span>
            </label>
          </div>
          <ChatStageLog
            entries={logEntries}
            names={{ me: 'You' }}
            maxVisible={6}
            tv={tvMode}
          />
        </div>
      </section>

      <!-- SECTION B: Self portrait isolation -->
      <section class="test-card">
        <h2 class="card-title">Self portrait isolation</h2>

        <div class="portrait-grid">
          <div class="portrait-canvas">
            <SelfMonkeyPortrait
              furColour={portraitFurColour}
              expression={portraitExpression}
              talkAmplitude={portraitTalkAmplitude}
              playerName="You"
            />
          </div>

          <div class="portrait-controls">
            <!-- Fur colour swatches -->
            <div class="control-column">
              <label class="control-label">Fur</label>
              <div class="colour-swatches-vertical">
                {#each FUR_COLOURS as colour}
                  <button
                    class="swatch"
                    class:active={portraitFurColour === colour}
                    style="background-color: {colour}"
                    onclick={() => (portraitFurColour = colour)}
                    aria-label="Select {colour}"
                    title={colour}
                  />
                {/each}
              </div>
            </div>

            <!-- Expression buttons -->
            <div class="control-column">
              <label class="control-label">Expression</label>
              <div class="expression-buttons">
                {#each expressions as expr}
                  <button
                    class="expr-btn"
                    class:active={portraitExpression === expr}
                    onclick={() => (portraitExpression = expr)}
                  >
                    {expr}
                  </button>
                {/each}
              </div>
            </div>

            <!-- Talk amplitude slider -->
            <div class="control-column">
              <label class="control-label">Talk amplitude</label>
              <div class="amplitude-control">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  bind:value={portraitTalkAmplitude}
                  class="amplitude-slider"
                />
                <div class="amplitude-display">
                  <div class="amplitude-value">{portraitTalkAmplitude.toFixed(2)}</div>
                  <div class="amplitude-meter">
                    <div
                      class="amplitude-fill"
                      style="width: {portraitTalkAmplitude * 100}%"
                    />
                  </div>
                </div>
              </div>
              <button class="pulse-btn" onclick={pulseAmplitude}>Pulse</button>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION C: Mic + meter -->
      <section class="test-card">
        <h2 class="card-title">Mic + meter</h2>

        <div class="mic-status">
          <div class="status-indicator" class:granted={micStatus === 'granted'} class:denied={micStatus !== 'off' && micStatus !== 'granted'} />
          <span class="status-text">
            {#if micStatus === 'off'}
              Off
            {:else if micStatus === 'granted'}
              Granted
            {:else}
              {micStatus}
            {/if}
          </span>
        </div>

        {#if micError}
          <div class="error-message">{micError}</div>
        {/if}

        <div class="mic-buttons">
          <button
            class="mic-btn request-btn"
            onclick={requestMic}
            disabled={micStatus !== 'off'}
          >
            Request mic
          </button>
          <button
            class="mic-btn stop-btn"
            onclick={stopMic}
            disabled={micStatus !== 'granted'}
          >
            Stop mic
          </button>
        </div>

        {#if micStatus === 'granted'}
          <div class="meter-section">
            <div class="meter-label">Live amplitude</div>
            <div class="amplitude-meter large-meter">
              <div
                class="amplitude-fill"
                style="width: {micAmplitude * 100}%"
              />
            </div>
            <div class="meter-value">{micAmplitude.toFixed(3)}</div>

            <div class="portrait-meter-box">
              <div class="meter-label">Voice jaw flap</div>
              <PlaceholderMonkey
                furColor={portraitFurColour}
                expression="neutral"
                talkAmplitude={micAmplitude}
                hat="none"
              />
            </div>
          </div>
        {/if}
      </section>

      <!-- SECTION D: Blip cadence reference -->
      <section class="test-card">
        <h2 class="card-title">Blip cadence reference</h2>
        <p class="cadence-help">Compare reveal speeds. Default is 18 cps.</p>

        <div class="cadence-demos">
          {#each cadenceSpeeds as { cps, label }}
            <div class="cadence-demo">
              <div class="cadence-label">{label}</div>
              <button
                class="cadence-play-btn"
                onclick={() => playCadenceDemo(cps)}
              >
                Play demo
              </button>
            </div>
          {/each}
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  .voice-test-harness {
    min-height: 100vh;
    background-color: var(--bg, #080a10);
    color: var(--text, #ffffff);
    padding: 2rem 1rem;
    font-family: inherit;
  }

  .harness-header {
    max-width: 600px;
    margin: 0 auto 2rem;
    text-align: center;
  }

  .harness-header h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  .harness-header p {
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 1.5rem;
    line-height: 1.5;
  }

  .breadcrumb-nav {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    flex-wrap: wrap;
  }

  .breadcrumb-nav a {
    color: rgba(0, 212, 255, 0.8);
    text-decoration: none;
    transition: color 0.2s;
  }

  .breadcrumb-nav a:hover {
    color: rgba(0, 212, 255, 1);
  }

  .breadcrumb-sep {
    color: rgba(255, 255, 255, 0.3);
  }

  .breadcrumb-current {
    color: rgba(255, 255, 255, 0.6);
  }

  .content-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  @media (min-width: 1100px) {
    .content-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .test-card {
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .card-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 1rem;
    color: rgba(255, 255, 255, 0.95);
  }

  /* ─── SECTION A: Chat ─────────────────────────────────────────────────────── */

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.4rem;
  }

  .form-group input[type='text'] {
    width: 100%;
    padding: 0.5rem;
    background-color: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: var(--text, #ffffff);
    font-size: 0.9rem;
    box-sizing: border-box;
  }

  .form-group input[type='text']:focus {
    outline: none;
    border-color: rgba(0, 212, 255, 0.5);
  }

  .char-count {
    display: block;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 0.2rem;
    text-align: right;
  }

  .colour-swatches {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .colour-swatches-vertical {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .swatch {
    width: 32px;
    height: 32px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .swatch:hover {
    border-color: rgba(255, 255, 255, 0.4);
  }

  .swatch.active {
    border-color: rgba(0, 212, 255, 0.8);
    box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
  }

  .send-btn {
    padding: 0.6rem 1.2rem;
    background-color: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 6px;
    color: rgba(0, 212, 255, 0.9);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    margin: 1rem 0;
  }

  .send-btn:hover {
    background-color: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
  }

  .send-btn:active {
    transform: scale(0.98);
  }

  .bubble-preview-box {
    position: relative;
    width: 100%;
    height: 200px;
    background-color: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 1rem 0;
    overflow: hidden;
  }

  .bubble-preview-label {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
  }

  .log-preview-box {
    position: relative;
    width: 100%;
    height: 400px;
    background-color: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 1rem;
    box-sizing: border-box;
    margin-top: 1rem;
    overflow: hidden;
  }

  .log-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    font-size: 0.8rem;
  }

  .log-preview-label {
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
  }

  .tv-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
  }

  .tv-toggle input[type='checkbox'] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: rgba(0, 212, 255, 0.6);
  }

  /* ─── SECTION B: Portrait ─────────────────────────────────────────────────── */

  .portrait-grid {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .portrait-canvas {
    flex-shrink: 0;
  }

  .portrait-controls {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .control-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .control-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
  }

  .expression-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .expr-btn {
    padding: 0.4rem 0.8rem;
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .expr-btn:hover {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .expr-btn.active {
    background-color: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
    color: rgba(0, 212, 255, 0.9);
  }

  .amplitude-control {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .amplitude-slider {
    width: 100%;
    height: 6px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 3px;
    outline: none;
    accent-color: rgba(0, 212, 255, 0.6);
  }

  .amplitude-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .amplitude-value {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    min-width: 2.5rem;
    text-align: right;
  }

  .amplitude-meter {
    flex: 1;
    height: 12px;
    background-color: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .amplitude-fill {
    height: 100%;
    background: linear-gradient(90deg, rgba(0, 212, 255, 0.3), rgba(0, 212, 255, 0.7));
    transition: width 0.05s linear;
  }

  .pulse-btn {
    padding: 0.4rem 0.8rem;
    background-color: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 6px;
    color: rgba(0, 212, 255, 0.8);
    font-weight: 500;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
    align-self: flex-start;
  }

  .pulse-btn:hover {
    background-color: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
  }

  /* ─── SECTION C: Mic ──────────────────────────────────────────────────────── */

  .mic-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.2);
    transition: all 0.2s;
  }

  .status-indicator.granted {
    background-color: rgba(34, 197, 94, 0.7);
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  }

  .status-indicator.denied {
    background-color: rgba(239, 68, 68, 0.7);
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  }

  .status-text {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
  }

  .error-message {
    padding: 0.75rem;
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    font-size: 0.8rem;
    color: rgba(239, 68, 68, 0.9);
    margin-bottom: 1rem;
    font-family: monospace;
    word-break: break-word;
  }

  .mic-buttons {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .mic-btn {
    flex: 1;
    padding: 0.6rem 1rem;
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.85rem;
  }

  .mic-btn:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.2);
    background-color: rgba(255, 255, 255, 0.05);
  }

  .mic-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .request-btn:not(:disabled) {
    background-color: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
    color: rgba(34, 197, 94, 0.9);
  }

  .stop-btn:not(:disabled) {
    background-color: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: rgba(239, 68, 68, 0.9);
  }

  .meter-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .meter-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
  }

  .large-meter {
    height: 20px;
  }

  .meter-value {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.5);
    text-align: right;
    font-family: monospace;
  }

  .portrait-meter-box {
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  /* ─── SECTION D: Cadence ──────────────────────────────────────────────────── */

  .cadence-help {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);
    margin: 0 0 1.5rem;
    line-height: 1.4;
  }

  .cadence-demos {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .cadence-demo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  .cadence-label {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
  }

  .cadence-play-btn {
    padding: 0.4rem 1rem;
    background-color: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 6px;
    color: rgba(0, 212, 255, 0.8);
    font-weight: 600;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .cadence-play-btn:hover {
    background-color: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .swatch,
    .send-btn,
    .expr-btn,
    .pulse-btn,
    .mic-btn,
    .cadence-play-btn {
      transition: none;
    }

    .amplitude-fill {
      transition: none;
    }

    .status-indicator {
      animation: none;
    }
  }
</style>
