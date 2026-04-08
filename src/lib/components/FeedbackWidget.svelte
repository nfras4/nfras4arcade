<script lang="ts">
  let { roomCode, gameType }: { roomCode?: string; gameType?: string } = $props();

  let open = $state(false);
  let category = $state<'bug' | 'suggestion' | 'other'>('other');
  let message = $state('');
  let submitting = $state(false);
  let toast = $state('');
  let toastType = $state<'success' | 'error'>('success');

  function close() {
    open = false;
    category = 'other';
    message = '';
  }

  async function submit() {
    if (!message.trim() || submitting) return;
    submitting = true;
    toast = '';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          roomCode,
          gameType,
        }),
      });
      if (!res.ok) {
        let errMsg = 'Something went wrong';
        try {
          const errData = await res.json();
          errMsg = (errData as { error?: string }).error || errMsg;
        } catch {}
        toastType = 'error';
        toast = errMsg;
        // Keep modal open so user can retry
      } else {
        toastType = 'success';
        toast = 'Thanks for your feedback!';
        close();
      }
    } catch {
      toastType = 'error';
      toast = 'Network error — check your connection';
      // Keep modal open so user can retry
    } finally {
      submitting = false;
    }
    setTimeout(() => { toast = ''; }, toastType === 'error' ? 5000 : 3000);
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

<button class="feedback-trigger" onclick={() => (open = true)} title="Send feedback">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
  <span class="feedback-trigger-label">Feedback</span>
</button>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="feedback-backdrop" onclick={handleBackdrop} onkeydown={handleKeydown}>
    <div class="feedback-modal" role="dialog" aria-label="Send feedback">
      <div class="feedback-header">
        <span class="feedback-title geo-title">Feedback</span>
        <button class="feedback-close" onclick={close} aria-label="Close">&times;</button>
      </div>

      <div class="feedback-body">
        <span class="feedback-label">Category</span>
        <div class="feedback-categories">
          <button
            class="feedback-cat-btn {category === 'bug' ? 'active' : ''}"
            onclick={() => (category = 'bug')}
          >Bug</button>
          <button
            class="feedback-cat-btn {category === 'suggestion' ? 'active' : ''}"
            onclick={() => (category = 'suggestion')}
          >Suggestion</button>
          <button
            class="feedback-cat-btn {category === 'other' ? 'active' : ''}"
            onclick={() => (category = 'other')}
          >Other</button>
        </div>

        <label class="feedback-label" for="feedback-msg">Message</label>
        <textarea
          id="feedback-msg"
          class="feedback-textarea"
          bind:value={message}
          maxlength={2000}
          placeholder="Tell us what you think..."
          rows="4"
        ></textarea>
        <span class="feedback-charcount">{message.length}/2000</span>

        <button
          class="btn-primary feedback-submit"
          onclick={submit}
          disabled={!message.trim() || submitting}
        >
          {submitting ? 'Sending...' : 'Submit'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="feedback-toast" class:toast-error={toastType === 'error'} class:toast-success={toastType === 'success'}>{toast}</div>
{/if}

<style>
  .feedback-trigger {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.85rem;
    background: var(--bg-card);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    clip-path: none;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .feedback-trigger:hover {
    color: var(--accent);
    border-color: var(--accent-border);
  }

  .feedback-trigger-label {
    pointer-events: none;
  }

  .feedback-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  .feedback-modal {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    width: 90%;
    max-width: 420px;
    padding: 1.5rem;
    position: relative;
    animation: fadeUp 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .feedback-modal::before {
    content: '';
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
  }

  .feedback-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .feedback-title {
    font-size: 0.95rem;
    color: var(--accent);
    letter-spacing: 0.1em;
  }

  .feedback-close {
    background: transparent;
    color: var(--text-muted);
    border: none;
    font-size: 1.4rem;
    line-height: 1;
    padding: 0.25rem 0.4rem;
    clip-path: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .feedback-close:hover {
    color: var(--text);
  }

  .feedback-body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .feedback-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .feedback-categories {
    display: flex;
    gap: 0.4rem;
  }

  .feedback-cat-btn {
    flex: 1;
    padding: 0.45rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    clip-path: none;
    border-radius: 2px;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .feedback-cat-btn:hover {
    color: var(--text);
    border-color: var(--border-bright);
  }

  .feedback-cat-btn.active {
    color: var(--accent);
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  .feedback-textarea {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.9rem;
    padding: 0.7rem 0.85rem;
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 2px;
    outline: none;
    resize: vertical;
    min-height: 80px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    width: 100%;
  }

  .feedback-textarea:focus {
    border-color: var(--accent-border);
    box-shadow: 0 0 0 2px var(--accent-faint);
  }

  .feedback-textarea::placeholder {
    color: var(--text-subtle);
  }

  .feedback-charcount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    color: var(--text-subtle);
    text-align: right;
    letter-spacing: 0.04em;
    margin-top: -0.3rem;
  }

  .feedback-submit {
    margin-top: 0.4rem;
    width: 100%;
  }

  .feedback-toast {
    position: fixed;
    bottom: 4rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    background: var(--bg-card);
    padding: 0.7rem 1.5rem;
    border-radius: 2px;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    animation: toastSlide 0.25s cubic-bezier(0.22, 1, 0.36, 1);
    white-space: nowrap;
    max-width: 90vw;
  }

  .toast-success {
    color: #2ecc71;
    border: 1px solid rgba(46, 204, 113, 0.4);
  }

  .toast-error {
    color: #e74c3c;
    border: 1px solid rgba(231, 76, 60, 0.4);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(1rem); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes toastSlide {
    from { opacity: 0; transform: translateY(0.75rem); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
