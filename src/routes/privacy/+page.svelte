<script lang="ts">
  const emailHref = 'mailto:nickwfraser@gmail.com'
</script>

<svelte:head>
  <title>Privacy | nfras4arcade</title>
  <meta name="description" content="What nfras4arcade collects, how it is stored, and how to remove it." />
</svelte:head>

<div class="page">
  <div class="content">
    <header class="hero">
      <p class="eyebrow">Privacy</p>
      <h1 class="title geo-title">Privacy</h1>
      <p class="lede">
        nfras4arcade is a hobby games platform. This page is the plain-English version of what
        it keeps about you and how to get rid of it. Last updated 27 May 2026.
      </p>
    </header>

    <section class="block">
      <h2 class="h2 geo-title">What it collects</h2>
      <p class="body">
        If you create an account, the platform stores the email address, display name, and
        password you provide, plus the gameplay data you generate: your chip balance, XP and
        level, badges and cosmetics, friends list, and per-game stats. Your password is hashed
        with PBKDF2-SHA256 and is never stored in plaintext.
      </p>
    </section>

    <section class="block">
      <h2 class="h2 geo-title">Playing as a guest</h2>
      <p class="body">
        Accounts are optional. You can play as a guest without giving an email or password. Guest
        play uses a temporary identifier so the game can track you within a room. Guests get no
        persistent profile, and guest progress is not saved between sessions.
      </p>
    </section>

    <section class="block">
      <h2 class="h2 geo-title">Where it lives, and what it does not do</h2>
      <p class="body">
        Account and gameplay data is stored in a Cloudflare D1 (SQLite) database at the edge. The
        only thing kept in your browser is a small theme preference (dark or light) in
        localStorage. There are no third-party advertising or analytics trackers, and your data is
        never sold or shared with third parties.
      </p>
    </section>

    <section class="block">
      <h2 class="h2 geo-title">Deleting your account</h2>
      <p class="body">
        You can ask for your account and its data to be deleted at any time. Email
        <a href={emailHref}>nickwfraser@gmail.com</a> from, or referencing, the address on the
        account and it will be removed.
      </p>
    </section>

    <section class="block">
      <h2 class="h2 geo-title">Contact</h2>
      <p class="body">
        Built by Nicholas W. Fraser. Privacy questions:
        <a href={emailHref}>nickwfraser@gmail.com</a>.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/about">← About this project</a>
        <a class="btn btn-primary" href="/">Back to the arcade</a>
      </div>
    </section>
  </div>
</div>

<style>
  .page {
    min-height: 100dvh;
    padding: 5rem 1.25rem 5rem;
    display: flex;
    justify-content: center;
  }

  .content {
    width: 100%;
    max-width: 760px;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .eyebrow {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0;
  }

  .title {
    font-size: clamp(2.25rem, 8vw, 3.75rem);
    font-weight: 700;
    letter-spacing: 0.1em;
    line-height: 1;
    margin: 0;
    background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 60%, var(--accent-dim) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .lede {
    font-size: 1.05rem;
    line-height: 1.6;
    color: var(--text);
    max-width: 60ch;
    margin: 0.25rem 0 0.5rem;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .h2 {
    font-size: 1rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .body {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--text);
    max-width: 65ch;
    margin: 0;
  }

  .body a {
    color: var(--accent);
    text-decoration: underline;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }

  .btn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.7rem 1rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 2px;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s, transform 0.1s;
  }

  .btn:hover {
    color: var(--accent);
    border-color: var(--accent-border);
    transform: translateY(-1px);
  }

  .btn-primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .btn-primary:hover {
    color: var(--bg);
    opacity: 0.9;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
