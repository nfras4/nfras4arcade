<script lang="ts">
  import { isLoggedIn, currentUser, fetchUser } from '$lib/auth';

  interface Friend {
    id: string;
    display_name: string;
    avatar: string | null;
    online: boolean;
    room?: { code: string; game: string };
  }

  interface PendingRequest {
    id: string;
    display_name: string;
    avatar: string | null;
    created_at: number;
  }

  let friends = $state<Friend[]>([]);
  let incoming = $state<PendingRequest[]>([]);
  let outgoing = $state<PendingRequest[]>([]);
  let loading = $state(true);
  let username = $state('');
  let sending = $state(false);
  let formError = $state('');
  let formSuccess = $state('');

  function gameToRoute(game: string): string {
    const explicit: Record<string, string> = {
      impostor: 'impostor',
      wavelength: 'wavelength',
      poker: 'poker',
      coup: 'coup',
      president: 'president',
      'chase-the-queen': 'chase-the-queen',
      chase_the_queen: 'chase-the-queen',
      connect_four: 'connect-four',
      'connect-four': 'connect-four',
    };
    return explicit[game] ?? game.replace(/_/g, '-');
  }

  async function loadAll() {
    loading = true;
    try {
      const [listRes, reqRes] = await Promise.all([
        fetch('/api/friends/list'),
        fetch('/api/friends/requests'),
      ]);
      if (listRes.ok) {
        const data: { friends: Friend[] } = await listRes.json();
        friends = data.friends ?? [];
      }
      if (reqRes.ok) {
        const data: { incoming: PendingRequest[]; outgoing: PendingRequest[] } = await reqRes.json();
        incoming = data.incoming ?? [];
        outgoing = data.outgoing ?? [];
      }
    } catch {}
    loading = false;
  }

  $effect(() => {
    fetchUser().then((user) => {
      if (user) loadAll();
      else loading = false;
    });
  });

  async function sendRequest(e: Event) {
    e.preventDefault();
    if (!username.trim() || sending) return;
    sending = true;
    formError = '';
    formSuccess = '';
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data: { success?: boolean; autoAccepted?: boolean; error?: string } = await res.json();
      if (data.success) {
        formSuccess = data.autoAccepted ? 'Friend added!' : 'Request sent';
        username = '';
        await loadAll();
      } else {
        formError = data.error || 'Failed to send request';
      }
    } catch {
      formError = 'Network error';
    }
    sending = false;
  }

  async function acceptRequest(fromId: string) {
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId }),
      });
      if (res.ok) await loadAll();
    } catch {}
  }

  async function declineRequest(fromId: string) {
    try {
      const res = await fetch('/api/friends/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId }),
      });
      if (res.ok) await loadAll();
    } catch {}
  }

  async function removeFriend(friendId: string) {
    if (!confirm('Remove this friend?')) return;
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId }),
      });
      if (res.ok) await loadAll();
    } catch {}
  }
</script>

<div class="page">
  <h1 class="heading">Friends</h1>

  {#if loading}
    <p class="muted">Loading...</p>
  {:else if !$isLoggedIn}
    <div class="auth-prompt">
      <p>Sign in to add friends</p>
      <a href="/login" class="btn">Log In</a>
    </div>
  {:else}
    {#if incoming.length > 0}
      <section class="section">
        <h2 class="section-title">Pending Requests ({incoming.length})</h2>
        <ul class="list">
          {#each incoming as req (req.id)}
            <li class="row">
              <span class="avatar">{req.avatar || req.display_name[0]?.toUpperCase()}</span>
              <span class="name">{req.display_name}</span>
              <div class="row-actions">
                <button class="btn btn-accept" onclick={() => acceptRequest(req.id)}>Accept</button>
                <button class="btn btn-ghost" onclick={() => declineRequest(req.id)}>Decline</button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if outgoing.length > 0}
      <section class="section">
        <h2 class="section-title">Outgoing</h2>
        <ul class="list list-small">
          {#each outgoing as req (req.id)}
            <li class="row row-small">
              <span class="avatar avatar-small">{req.avatar || req.display_name[0]?.toUpperCase()}</span>
              <span class="name">{req.display_name}</span>
              <span class="muted">Pending</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="section">
      <h2 class="section-title">Add Friend</h2>
      <form class="add-form" onsubmit={sendRequest}>
        <input
          type="text"
          bind:value={username}
          placeholder="Username"
          class="input"
          disabled={sending}
        />
        <button type="submit" class="btn btn-accept" disabled={sending || !username.trim()}>
          {sending ? 'Sending...' : 'Send Request'}
        </button>
      </form>
      {#if formError}<p class="error">{formError}</p>{/if}
      {#if formSuccess}<p class="success">{formSuccess}</p>{/if}
    </section>

    <section class="section">
      <h2 class="section-title">Friends ({friends.length})</h2>
      {#if friends.length === 0}
        <p class="muted">No friends yet. Send a request above to get started.</p>
      {:else}
        <ul class="list">
          {#each friends as f (f.id)}
            <li class="row">
              <span class="avatar">{f.avatar || f.display_name[0]?.toUpperCase()}</span>
              <span class="name">
                {f.display_name}
                {#if f.online}<span class="online-dot" title="Online"></span>{/if}
              </span>
              <div class="row-actions">
                {#if f.room}
                  <a class="btn btn-accept" href={`/${gameToRoute(f.room.game)}/${f.room.code}`}>Join</a>
                {/if}
                <button class="btn btn-ghost btn-small" onclick={() => removeFriend(f.id)}>Remove</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .page {
    max-width: 680px;
    margin: 0 auto;
    padding: 5rem 1.25rem 4rem;
    color: var(--text);
  }

  .heading {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin: 0 0 1.5rem;
    color: var(--accent);
  }

  .section {
    margin-bottom: 2rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1rem 1.25rem;
  }

  .section-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0 0 0.75rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .list-small { gap: 0.25rem; }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.5rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
  }

  .row-small {
    padding: 0.4rem 0.5rem;
    opacity: 0.85;
  }

  .avatar {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-faint);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .avatar-small {
    width: 24px;
    height: 24px;
    font-size: 0.8rem;
  }

  .name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
    color: var(--text);
  }

  .online-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
  }

  .row-actions {
    display: flex;
    gap: 0.4rem;
  }

  .btn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.4rem 0.75rem;
    border-radius: 2px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .btn:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--accent-border);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-accept {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .btn-accept:hover:not(:disabled) {
    opacity: 0.85;
    color: var(--bg);
  }

  .btn-ghost {
    background: transparent;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.6rem;
  }

  .add-form {
    display: flex;
    gap: 0.5rem;
  }

  .input {
    flex: 1;
    padding: 0.55rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--text);
    font-family: inherit;
    font-size: 0.9rem;
  }

  .input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .error {
    margin: 0.5rem 0 0;
    color: var(--red, #ef4444);
    font-size: 0.8rem;
  }

  .success {
    margin: 0.5rem 0 0;
    color: #22c55e;
    font-size: 0.8rem;
  }

  .auth-prompt {
    text-align: center;
    padding: 2rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .auth-prompt p {
    margin: 0 0 1rem;
    color: var(--text-muted);
  }
</style>
