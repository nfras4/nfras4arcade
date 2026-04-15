<script lang="ts">
  import type { DodgeState, DodgeResult, DodgePattern } from './dodge'
  import { playSound } from './audio'

  const INTRO_MS = 1200  // warning before projectiles start

  let { dodgeState, onComplete }: {
    dodgeState: DodgeState
    onComplete: (result: DodgeResult) => void
  } = $props()

  let canvas: HTMLCanvasElement | null = $state(null)

  type ActiveProjectile = {
    id: number
    x: number; y: number
    vx: number; vy: number
    size: number
    colour: string
    kind: 'circle' | 'wave' | 'wall'
    bounces: boolean
    gapStart?: number
    gapEnd?: number
    alive: boolean
  }

  let projSeq = 0
  const HEART_HALF = 2  // 4×4 hitbox — smaller than visual, classic Undertale feel

  function spawnFromConfig(
    cfg: import('./dodge').ProjectileConfig,
    w: number,
    h: number,
    projs: ActiveProjectile[],
  ): void {
    const cx = w / 2
    const cy = h / 2
    const spd = cfg.speed / 60  // px per frame at 60fps

    switch (cfg.shape) {
      case 'rain': {
        const slot = w / cfg.count
        for (let i = 0; i < cfg.count; i++) {
          const x = slot * i + slot * 0.2 + Math.random() * slot * 0.6
          projs.push({ id: ++projSeq, x, y: -cfg.size, vx: 0, vy: spd, size: cfg.size, colour: cfg.colour, kind: 'circle', bounces: false, alive: true })
        }
        break
      }
      case 'bullet': {
        for (let i = 0; i < cfg.count; i++) {
          const edge = Math.floor(Math.random() * 4)
          let x = 0, y = 0
          if      (edge === 0) { x = Math.random() * w;   y = -cfg.size     }
          else if (edge === 1) { x = Math.random() * w;   y = h + cfg.size  }
          else if (edge === 2) { x = -cfg.size;            y = Math.random() * h }
          else                 { x = w + cfg.size;         y = Math.random() * h }
          const tx = cx + (Math.random() - 0.5) * cx
          const ty = cy + (Math.random() - 0.5) * cy
          const dx = tx - x, dy = ty - y
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          projs.push({ id: ++projSeq, x, y, vx: dx / len * spd, vy: dy / len * spd, size: cfg.size, colour: cfg.colour, kind: 'circle', bounces: false, alive: true })
        }
        break
      }
      case 'spiral': {
        const step = (2 * Math.PI) / cfg.count
        for (let i = 0; i < cfg.count; i++) {
          const a = step * i
          projs.push({ id: ++projSeq, x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, size: cfg.size, colour: cfg.colour, kind: 'circle', bounces: false, alive: true })
        }
        break
      }
      case 'cross': {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        const perDir = Math.ceil(cfg.count / 4)
        for (let d = 0; d < 4; d++) {
          for (let k = 0; k < perDir && d * perDir + k < cfg.count; k++) {
            const s = spd * (1 + k * 0.2)
            projs.push({ id: ++projSeq, x: cx, y: cy, vx: dirs[d][0] * s, vy: dirs[d][1] * s, size: cfg.size, colour: cfg.colour, kind: 'circle', bounces: false, alive: true })
          }
        }
        break
      }
      case 'chaos': {
        for (let i = 0; i < cfg.count; i++) {
          const a = Math.random() * 2 * Math.PI
          const px = cfg.size + Math.random() * (w - 2 * cfg.size)
          const py = cfg.size + Math.random() * (h - 2 * cfg.size)
          projs.push({ id: ++projSeq, x: px, y: py, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, size: cfg.size, colour: cfg.colour, kind: 'circle', bounces: true, alive: true })
        }
        break
      }
      case 'wave': {
        const gap = cfg.gapSize ?? 60
        const gapCtr = 15 + Math.random() * 70
        const gS = (gapCtr / 100 - gap / 200) * w
        const gE = (gapCtr / 100 + gap / 200) * w
        projs.push({ id: ++projSeq, x: 0, y: -cfg.size, vx: 0, vy: spd, size: cfg.size, colour: cfg.colour, kind: 'wave', bounces: false, gapStart: gS, gapEnd: gE, alive: true })
        break
      }
      case 'wall': {
        const gap = cfg.gapSize ?? 60
        const gapCtr = 15 + Math.random() * 70
        const gS = (gapCtr / 100 - gap / 200) * h
        const gE = (gapCtr / 100 + gap / 200) * h
        projs.push({ id: ++projSeq, x: -cfg.size, y: 0, vx: spd, vy: 0, size: cfg.size, colour: cfg.colour, kind: 'wall', bounces: false, gapStart: gS, gapEnd: gE, alive: true })
        break
      }
    }
  }

  function collides(p: ActiveProjectile, hx: number, hy: number, w: number, h: number): boolean {
    if (p.kind === 'circle') {
      const dx = p.x - hx, dy = p.y - hy
      return Math.sqrt(dx * dx + dy * dy) < p.size + HEART_HALF
    }
    if (p.kind === 'wave') {
      if (hy + HEART_HALF < p.y - p.size || hy - HEART_HALF > p.y + p.size) return false
      return !(hx > (p.gapStart ?? 0) && hx < (p.gapEnd ?? w))
    }
    if (p.kind === 'wall') {
      if (hx + HEART_HALF < p.x - p.size || hx - HEART_HALF > p.x + p.size) return false
      return !(hy > (p.gapStart ?? 0) && hy < (p.gapEnd ?? h))
    }
    return false
  }

  function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, flash: boolean): void {
    const s = 9
    ctx.save()
    ctx.fillStyle = flash ? '#ffffff' : '#ff3030'
    ctx.shadowColor = flash ? '#ffffff' : '#ff2020'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(x, y + s * 0.35)
    ctx.bezierCurveTo(x, y - s * 0.5, x - s * 1.1, y - s * 0.5, x - s * 0.75, y + s * 0.1)
    ctx.bezierCurveTo(x - s * 0.25, y + s * 0.7, x, y + s, x, y + s)
    ctx.bezierCurveTo(x, y + s, x + s * 0.25, y + s * 0.7, x + s * 0.75, y + s * 0.1)
    ctx.bezierCurveTo(x + s * 1.1, y - s * 0.5, x, y - s * 0.5, x, y + s * 0.35)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  $effect(() => {
    const cv = canvas
    if (!cv || !dodgeState.pattern) return

    const pattern = dodgeState.pattern
    const pal = pattern.palette

    // Size canvas to element
    cv.width  = cv.offsetWidth  || window.innerWidth
    cv.height = cv.offsetHeight || window.innerHeight

    let heartX = cv.width / 2
    let heartY = cv.height * 0.75
    let hits = 0
    let hitFlashUntil = 0
    let resultText = ''
    let resultColour = ''
    let resultFlashUntil = 0
    let finished = false
    let frame = 0
    const startTime = performance.now()
    const spawned = new Set<number>()
    const projs: ActiveProjectile[] = []

    function finish(result: DodgeResult): void {
      if (finished) return
      finished = true
      const texts: Record<DodgeResult, string>   = { perfect: 'PERFECT DODGE', partial: 'DODGED', failed: 'FAILED' }
      const colours: Record<DodgeResult, string> = { perfect: '#40ff60',       partial: '#ffe040', failed: '#ff4040' }
      resultText   = texts[result]
      resultColour = colours[result]
      resultFlashUntil = performance.now() + 400
      if (result === 'perfect') playSound('dodge-perfect', 0.4)
      setTimeout(() => onComplete(result), 450)
    }

    function loop(now: number): void {
      if (finished) return
      const elapsed = now - startTime
      const w = cv!.width
      const h = cv!.height
      const ctx = cv!.getContext('2d')!

      // Background
      ctx.fillStyle = pal.bg
      ctx.fillRect(0, 0, w, h)

      // Boss sprite (faded)
      ctx.save()
      ctx.globalAlpha = 0.07
      ctx.font = `${Math.min(w, h) * 0.5}px serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#fff'
      ctx.fillText(pattern.bossSprite, w / 2, h / 2)
      ctx.restore()

      // Intro phase — show boss name and flavour text
      const gameElapsed = Math.max(0, elapsed - INTRO_MS)
      if (elapsed < INTRO_MS) {
        const introProg = elapsed / INTRO_MS   // 0→1
        ctx.save()
        ctx.globalAlpha = Math.min(1, introProg * 3)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Boss name
        ctx.font = `bold ${Math.max(20, Math.floor(w * 0.07))}px monospace`
        ctx.fillStyle = pal.accentColour
        ctx.shadowColor = pal.accentColour
        ctx.shadowBlur = 16
        ctx.fillText(dodgeState.bossName || pattern.bossSprite + ' ATTACKS!', w / 2, h * 0.38)

        // Flavour text
        if (dodgeState.flavourText) {
          ctx.font = `italic ${Math.max(13, Math.floor(w * 0.038))}px monospace`
          ctx.fillStyle = '#ffffff99'
          ctx.shadowBlur = 0
          ctx.fillText(`"${dodgeState.flavourText}"`, w / 2, h * 0.52)
        }
        ctx.restore()
      }

      // Timer bar (top)
      const timerFrac = Math.max(0, 1 - gameElapsed / pattern.duration)
      ctx.fillStyle = pal.accentColour + '30'
      ctx.fillRect(0, 0, w, 5)
      ctx.fillStyle = pal.accentColour
      ctx.fillRect(0, 0, w * timerFrac, 5)

      // Spawn projectiles
      for (let ci = 0; ci < pattern.projectiles.length; ci++) {
        const cfg = pattern.projectiles[ci]
        if (!spawned.has(ci) && gameElapsed >= cfg.spawnAt) {
          spawned.add(ci)
          spawnFromConfig(cfg, w, h, projs)
        }
      }

      // Update & draw projectiles
      for (const p of projs) {
        if (!p.alive) continue
        p.x += p.vx
        p.y += p.vy
        if (p.bounces) {
          if (p.x - p.size < 0)    { p.x = p.size;    p.vx = Math.abs(p.vx) }
          if (p.x + p.size > w)    { p.x = w - p.size; p.vx = -Math.abs(p.vx) }
          if (p.y - p.size < 0)    { p.y = p.size;    p.vy = Math.abs(p.vy) }
          if (p.y + p.size > h)    { p.y = h - p.size; p.vy = -Math.abs(p.vy) }
        } else {
          if (p.kind === 'circle' && (p.x < -80 || p.x > w + 80 || p.y < -80 || p.y > h + 80)) { p.alive = false; continue }
          if (p.kind === 'wave'  && p.y - p.size > h) { p.alive = false; continue }
          if (p.kind === 'wall'  && p.x - p.size > w) { p.alive = false; continue }
        }

        // Draw
        if (p.kind === 'circle') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fillStyle = p.colour
          ctx.fill()
        } else if (p.kind === 'wave') {
          ctx.fillStyle = p.colour
          ctx.fillRect(0,         p.y - p.size, (p.gapStart ?? 0),   p.size * 2)
          ctx.fillRect(p.gapEnd ?? w, p.y - p.size, w,                p.size * 2)
        } else if (p.kind === 'wall') {
          ctx.fillStyle = p.colour
          ctx.fillRect(p.x - p.size, 0,          p.size * 2, p.gapStart ?? 0)
          ctx.fillRect(p.x - p.size, p.gapEnd ?? h, p.size * 2, h)
        }
      }

      // Collision
      if (performance.now() > hitFlashUntil) {
        for (const p of projs) {
          if (!p.alive) continue
          if (collides(p, heartX, heartY, w, h)) {
            hits++
            hitFlashUntil = performance.now() + 180
            playSound('dodge-hit', 0.35)
            break
          }
        }
      }

      // Draw heart
      drawHeart(ctx, heartX, heartY, performance.now() < hitFlashUntil)

      // HUD
      ctx.fillStyle = hits > 0 ? '#ff4040' : '#505050'
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`HITS: ${hits}`, 8, 10)
      ctx.fillStyle = '#ffffff14'
      ctx.font = '8px monospace'
      ctx.fillText(pattern.id, 8, 24)

      // Result flash
      if (performance.now() < resultFlashUntil) {
        ctx.save()
        ctx.globalAlpha = Math.min(1, (resultFlashUntil - performance.now()) / 200)
        ctx.font = `bold ${Math.max(18, Math.floor(w * 0.06))}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = resultColour
        ctx.shadowColor = resultColour
        ctx.shadowBlur = 20
        ctx.fillText(resultText, w / 2, h / 2)
        ctx.restore()
      }

      // End conditions (gameElapsed tracks time after intro)
      if (hits >= 3) { finish('failed'); return }
      if (gameElapsed >= pattern.duration) { finish(hits === 0 ? 'perfect' : 'partial'); return }

      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)

    function onMouse(e: MouseEvent) {
      const r = cv!.getBoundingClientRect()
      heartX = e.clientX - r.left
      heartY = e.clientY - r.top
    }
    function onTouch(e: TouchEvent) {
      e.preventDefault()
      const r = cv!.getBoundingClientRect()
      heartX = e.touches[0].clientX - r.left
      heartY = e.touches[0].clientY - r.top
    }
    window.addEventListener('mousemove', onMouse)
    cv.addEventListener('touchmove', onTouch, { passive: false })

    return () => {
      finished = true
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', onMouse)
      cv!.removeEventListener('touchmove', onTouch)
    }
  })
</script>

<div class="dodge-overlay">
  <canvas bind:this={canvas} class="dodge-canvas"></canvas>
</div>

<style>
  .dodge-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    animation: fadeIn 0.2s ease-out;
  }
  .dodge-canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: none;
    touch-action: none;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
