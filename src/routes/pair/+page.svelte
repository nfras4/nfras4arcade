<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getDeviceFingerprint } from '$lib/components/pairing/deviceFingerprint';

  type Mode = 'auto-pairing' | 'auto-error' | 'manual' | 'submitting' | 'paired';

  let mode: Mode = $state('manual');
  let codeInput = $state('');
  let errorMsg: string | null = $state(null);
  let remembered = $state(false);
  let rememberCheckbox = $state(false);
  let submitting = $state(false);

  let urlToken = $derived($page.url.searchParams.get('token'));

  $effect(() => {
    const t = urlToken;
    if (!t) return;
    mode = 'auto-pairing';
    submitToken(t, 'auto');
  });

  $effect(() => {
    if (urlToken) return;
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const fp = await getDeviceFingerprint();
        if (!fp || cancelled) return;
        const res = await fetch('/api/pair/check_remembered', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fingerprint: fp }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { remembered?: boolean };
        if (!cancelled && data.remembered) remembered = true;
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  });

  function describeError(status: number, body: { error?: string } | null, retryAfter: string | null): string {
    if (status === 429) {
      return retryAfter
        ? `Too many attempts, try again in ${retryAfter}s.`
        : 'Too many attempts, try again later.';
    }
    if (status === 401) {
      return 'Sign in to pair this device.';
    }
    if (status === 403 || body?.error === 'auth-mismatch') {
      return 'Sign in with the same account on both devices.';
    }
    if (body?.error === 'expired' || status === 400) {
      return 'Pairing code expired or unknown. Ask your PC to generate a fresh code.';
    }
    if (status >= 500) return 'Server error. Try again.';
    return 'Pair request failed.';
  }

  async function submitToken(rawToken: string, source: 'auto' | 'manual') {
    submitting = true;
    errorMsg = null;
    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: rawToken, role: 'controller' }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; ok?: boolean; roomCode?: string; gameType?: string } | null;
      if (!res.ok || !body?.ok) {
        errorMsg = describeError(res.status, body, res.headers.get('Retry-After'));
        mode = source === 'auto' ? 'auto-error' : 'manual';
        return;
      }

      // WHY: in v1 the "remember" record is keyed (user_id, partner_fingerprint) where partner_fingerprint is THIS phone's own fingerprint. PairButton on the PC also stores under the same user_id with the SAME fingerprint scheme so subsequent /pair visits from this phone can detect a remembered pair without needing the PC to push state. This is the documented Phase 3 simplification.
      if (rememberCheckbox) {
        try {
          const fp = await getDeviceFingerprint();
          if (fp) {
            await fetch('/api/pair/remember', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ partnerFingerprint: fp }),
            });
          }
        } catch {}
      }

      mode = 'paired';
      const roomCode = body.roomCode!;
      goto(`/poker/${roomCode}?role=controller`);
    } catch {
      errorMsg = 'Network error. Try again.';
      mode = source === 'auto' ? 'auto-error' : 'manual';
    } finally {
      submitting = false;
    }
  }

  function onCodeInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    const stripped = raw.replace(/-/g, '').slice(0, 6);
    codeInput = stripped.length > 3 ? `${stripped.slice(0, 3)}-${stripped.slice(3)}` : stripped;
  }

  function handleManualSubmit(e: Event) {
    e.preventDefault();
    const stripped = codeInput.replace(/-/g, '');
    if (!/^[A-Za-z0-9_-]{6}$/.test(stripped)) {
      errorMsg = 'Code must be 6 characters (letters, numbers, _ or -).';
      return;
    }
    submitToken(stripped, 'manual');
  }

  function retryFromError() {
    errorMsg = null;
    mode = 'manual';
  }
</script>

<div class="pair-page">
  <div class="pair-card card">
    <h1 class="geo-title">Pair phone</h1>

    {#if mode === 'auto-pairing'}
      <p class="pair-status">Pairing your phone...</p>
    {:else if mode === 'paired'}
      <p class="pair-status">Paired. Redirecting...</p>
    {:else if mode === 'auto-error'}
      <p class="pair-error-msg">{errorMsg}</p>
      <button class="btn-primary" onclick={retryFromError}>Enter code manually</button>
    {:else}
      {#if remembered && !urlToken}
        <div class="pair-remembered">
          <p>We remember a previous pair on this phone.</p>
          <p class="pair-hint">Scan the QR code on your PC again to rejoin. We can not push session state to your phone without an active pairing.</p>
        </div>
      {/if}

      <form onsubmit={handleManualSubmit} class="pair-form">
        <label>
          <span>Enter the 6-character code from your PC</span>
          <input
            type="text"
            inputmode="text"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="abc-def"
            value={codeInput}
            oninput={onCodeInput}
            maxlength="7"
            required
          />
        </label>

        <label class="pair-checkbox">
          <input type="checkbox" bind:checked={rememberCheckbox} />
          <span>Remember this device pair for 7 days</span>
        </label>

        {#if errorMsg}
          <p class="pair-error-msg">{errorMsg}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={submitting}>
          {submitting ? 'Pairing...' : 'Pair'}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .pair-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    padding: 1rem;
  }
  .pair-card {
    width: 100%;
    max-width: 420px;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .pair-card h1 {
    text-align: center;
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
  }
  .pair-status {
    text-align: center;
    color: var(--text-muted);
    margin: 0;
  }
  .pair-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .pair-form label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .pair-form label span {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pair-form input[type='text'] {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 1.4rem;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    letter-spacing: 0.15em;
    text-align: center;
  }
  .pair-form input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .pair-checkbox {
    flex-direction: row !important;
    align-items: center;
    gap: 0.5rem !important;
  }
  .pair-checkbox span {
    font-size: 0.85rem;
    color: var(--text);
    text-transform: none !important;
    letter-spacing: 0 !important;
    font-weight: 400 !important;
  }
  .pair-error-msg {
    color: var(--red, #e74c3c);
    font-size: 0.9rem;
    margin: 0;
    text-align: center;
  }
  .pair-remembered {
    padding: 0.75rem;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 4px;
  }
  .pair-remembered p {
    margin: 0 0 0.25rem;
    font-size: 0.9rem;
  }
  .pair-hint {
    font-size: 0.8rem !important;
    color: var(--text-muted);
  }
</style>
