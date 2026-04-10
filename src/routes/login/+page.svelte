<script lang="ts">
  import { goto } from '$app/navigation';
  import { login } from '$lib/auth';
  import { getGuestDisplayName } from '$lib/guest';
  import { fly } from 'svelte/transition';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;
    const result = await login(email, password);
    loading = false;
    if (result.ok) {
      goto('/');
    } else {
      error = result.error || 'Login failed';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit(e);
  }
</script>

<div class="auth-page">
  <div class="auth-card card" in:fly={{ y: 24, duration: 300 }}>
    <h1 class="geo-title">Login</h1>
    <form onsubmit={handleSubmit}>
      <label>
        <span>Email</span>
        <input
          type="email"
          bind:value={email}
          placeholder="you@example.com"
          required
        />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          bind:value={password}
          placeholder="Your password"
          minlength="8"
          required
          onkeydown={handleKeydown}
        />
      </label>
      {#if error}
        <p class="error-msg">{error}</p>
      {/if}
      <button type="submit" class="btn-primary" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
    <div class="guest-divider">
      <span>or</span>
    </div>
    <button class="btn-secondary btn-guest" onclick={() => goto('/')}>
      Continue as Guest
    </button>
    <p class="guest-note">
      Login is optional, but signing in lets us save your stats and helps us improve the game during development.
    </p>
    <p class="auth-link">
      Don't have an account? <a href="/register">Register</a>
    </p>
  </div>
</div>

<style>
  .auth-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    padding: 1rem;
  }

  .auth-card {
    width: 100%;
    max-width: 400px;
    padding: 2rem;
  }

  .auth-card h1 {
    text-align: center;
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label span {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 1rem;
    font-family: inherit;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .error-msg {
    color: var(--red, #e74c3c);
    font-size: 0.9rem;
    margin: 0;
  }

  .btn-primary {
    margin-top: 0.5rem;
  }

  .auth-link {
    text-align: center;
    margin-top: 1.5rem;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .auth-link a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }

  .auth-link a:hover {
    text-decoration: underline;
  }

  .guest-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.5rem 0;
  }

  .guest-divider::before,
  .guest-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .guest-divider span {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 600;
  }

  .btn-guest {
    width: 100%;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
  }

  .guest-note {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.5;
    text-align: center;
    margin-top: 0.5rem;
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }

  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-secondary:hover:not(:disabled) { background: var(--accent-border); color: var(--accent); }

  .gap-4 { gap: 1rem; }
  .gap-6 { gap: 1.5rem; }
</style>
