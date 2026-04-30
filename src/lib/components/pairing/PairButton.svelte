<script lang="ts">
  import type { CardGamePhase } from '../../../../worker/cards/types';
  import type { CardGameSocket } from '$lib/cardSocket';
  import QRDisplay from './QRDisplay.svelte';

  let {
    roomCode,
    playerId,
    phase,
    socket,
  }: {
    roomCode: string;
    playerId: string;
    phase: CardGamePhase;
    socket: CardGameSocket | null;
  } = $props();

  type Status = 'idle' | 'loading' | 'qr' | 'paired' | 'error';

  let status: Status = $state('idle');
  let token: string | null = $state(null);
  let expiresAt: number | null = $state(null);
  let countdown: number = $state(60);
  let qrUrl: string | null = $state(null);
  let error: string | null = $state(null);
  $effect(() => {
    if (status !== 'qr' || expiresAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt! - Date.now()) / 1000));
      countdown = remaining;
      if (remaining <= 0) {
        status = 'idle';
        token = null;
        qrUrl = null;
        expiresAt = null;
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (!socket) return;
    return socket.onMessage((msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'paired_device_added' && msg.playerId === playerId && msg.role === 'controller') {
        status = 'paired';
        token = null;
        qrUrl = null;
        expiresAt = null;
      } else if (msg.type === 'paired_device_removed' && msg.playerId === playerId && msg.role === 'controller') {
        status = 'idle';
      }
    });
  });

  async function startPair() {
    status = 'loading';
    error = null;
    try {
      const res = await fetch('/api/pair/issue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId, gameType: 'poker' }),
      });
      if (res.status === 429) {
        const retry = res.headers.get('Retry-After');
        error = retry ? `Too many attempts, try again in ${retry}s` : 'Too many attempts, try again later';
        status = 'error';
        return;
      }
      if (res.status === 401) {
        error = 'Sign in to use paired mode';
        status = 'error';
        return;
      }
      if (!res.ok) {
        error = 'Pair request failed';
        status = 'error';
        return;
      }
      const data = (await res.json()) as { token: string; expiresAt: number };
      token = data.token;
      expiresAt = data.expiresAt;
      qrUrl = `${location.origin}/pair?token=${encodeURIComponent(data.token)}`;
      countdown = Math.max(0, Math.ceil((data.expiresAt - Date.now()) / 1000));
      status = 'qr';
    } catch {
      error = 'Pair request failed';
      status = 'error';
    }
  }

  function cancel() {
    status = 'idle';
    token = null;
    qrUrl = null;
    expiresAt = null;
    error = null;
  }

  function fallbackCode(t: string): string {
    return `${t.slice(0, 3)}-${t.slice(3, 6)}`;
  }
</script>

{#if phase === 'lobby'}
  <div class="pair-button-wrap">
    {#if status === 'idle'}
      <button class="btn-primary pair-btn" onclick={startPair}>Pair my phone</button>
    {:else if status === 'loading'}
      <button class="btn-primary pair-btn" disabled>Loading...</button>
    {:else if status === 'qr' && qrUrl && token}
      <div class="pair-qr-card">
        <QRDisplay text={qrUrl} size={240} />
        <div class="pair-fallback">
          <span class="pair-fallback-label">Or enter code</span>
          <span class="pair-fallback-code">{fallbackCode(token)}</span>
        </div>
        <p class="pair-countdown">Expires in {countdown}s</p>
        <button class="btn-secondary" onclick={cancel}>Cancel</button>
      </div>
    {:else if status === 'paired'}
      <div class="pair-paired">
        <span class="pair-paired-icon">[OK]</span> Phone paired
        <button class="btn-secondary pair-dismiss" onclick={() => (status = 'idle')}>Dismiss</button>
      </div>
    {:else if status === 'error'}
      <div class="pair-error">
        <p class="pair-error-msg">{error ?? 'Something went wrong'}</p>
        <button class="btn-secondary" onclick={cancel}>Try again</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .pair-button-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .pair-btn {
    min-width: 12rem;
  }
  .pair-qr-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .pair-fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .pair-fallback-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .pair-fallback-code {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--accent);
  }
  .pair-countdown {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
  }
  .pair-paired {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 4px;
    color: var(--accent);
    font-weight: 600;
  }
  .pair-paired-icon {
    font-family: ui-monospace, monospace;
  }
  .pair-dismiss {
    margin-left: 0.5rem;
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
  }
  .pair-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .pair-error-msg {
    color: var(--red, #e74c3c);
    margin: 0;
    font-size: 0.9rem;
  }
</style>
