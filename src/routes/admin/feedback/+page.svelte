<script lang="ts">
  let { data } = $props();

  let sortField = $state<'created_at' | 'category'>('created_at');
  let sortDir = $state<'asc' | 'desc'>('desc');

  let sorted = $derived(() => {
    const items = [...data.feedback];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'created_at') {
        cmp = a.created_at - b.created_at;
      } else {
        cmp = a.category.localeCompare(b.category);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return items;
  });

  function toggleSort(field: 'created_at' | 'category') {
    if (sortField === field) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortField = field;
      sortDir = 'desc';
    }
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString();
  }

  function categoryLabel(cat: string): string {
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }
</script>

<div class="admin-feedback">
  <h1 class="geo-title page-title">Feedback</h1>

  {#if sorted().length === 0}
    <p class="empty-msg">No feedback yet.</p>
  {:else}
    <div class="table-wrap">
      <table class="feedback-table">
        <thead>
          <tr>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('created_at')}>
                Date {sortField === 'created_at' ? (sortDir === 'desc' ? '\u25BC' : '\u25B2') : ''}
              </button>
            </th>
            <th>Player</th>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('category')}>
                Category {sortField === 'category' ? (sortDir === 'desc' ? '\u25BC' : '\u25B2') : ''}
              </button>
            </th>
            <th>Room</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {#each sorted() as item (item.id)}
            <tr>
              <td class="td-date">{formatDate(item.created_at)}</td>
              <td class="td-player">{item.player_name}</td>
              <td>
                <span class="cat-badge cat-{item.category}">{categoryLabel(item.category)}</span>
              </td>
              <td class="td-room">{item.room_code ?? '-'}</td>
              <td class="td-message">{item.message}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .admin-feedback {
    max-width: 960px;
    margin: 0 auto;
    padding: 5rem 1rem 2rem;
    position: relative;
    z-index: 1;
  }

  .page-title {
    font-size: 1.1rem;
    color: var(--accent);
    letter-spacing: 0.12em;
    margin-bottom: 1.5rem;
  }

  .empty-msg {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .feedback-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .feedback-table th {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: left;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border-bright);
    white-space: nowrap;
  }

  .feedback-table td {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    color: var(--text);
  }

  .feedback-table tbody tr:hover {
    background: var(--bg-hover);
  }

  .sort-btn {
    background: transparent;
    color: var(--text-muted);
    border: none;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0;
    clip-path: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .sort-btn:hover {
    color: var(--accent);
  }

  .td-date {
    white-space: nowrap;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .td-player {
    white-space: nowrap;
    font-weight: 500;
  }

  .td-room {
    white-space: nowrap;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .td-message {
    max-width: 400px;
    word-break: break-word;
  }

  .cat-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 2px;
  }

  .cat-bug {
    color: var(--red);
    background: rgba(233, 69, 96, 0.1);
    border: 1px solid rgba(233, 69, 96, 0.25);
  }

  .cat-suggestion {
    color: var(--blue);
    background: rgba(77, 168, 230, 0.1);
    border: 1px solid rgba(77, 168, 230, 0.25);
  }

  .cat-other {
    color: var(--text-muted);
    background: var(--accent-faint);
    border: 1px solid var(--border);
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
