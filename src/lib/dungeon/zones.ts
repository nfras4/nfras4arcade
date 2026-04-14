export type ZonePalette = {
  bg: string
  panel: string
  panel2: string
  border: string
  borderHi: string
  accent: string
  accent2: string
}

export type ParticleConfig = {
  color: string
  size: number
  count: number
  speedY: number
  speedX: number
  life: number
}

export type Zone = {
  id: number
  name: string
  label: string
  palette: ZonePalette
  groundPattern: string
  drawBg: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  particles: ParticleConfig[]
  enemyPool: string[]
  elitePool: string[]
  miniboss: string
  boss: string
  stages: number   // always 20
  storyText: string[]
}

export const ZONES: Zone[] = [

  // ── ZONE 1: JOHNO'S BASEMENT ─────────────────────────────────────────────
  {
    id: 0,
    name: "ZONE 1 — JOHNO'S BASEMENT",
    label: "JOHNO'S BASEMENT",
    palette: {
      bg: '#060a06', panel: '#0c110c', panel2: '#121a12',
      border: '#1a2e1a', borderHi: '#2a5a2a',
      accent: '#5aff6a', accent2: '#30a040',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0e1a0e 0,#0e1a0e 16px,#122014 16px,#122014 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#040a04')
      g.addColorStop(0.6, '#081408')
      g.addColorStop(1, '#0c1a0c')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#0a120a'
      for (let y = 10; y < h - 36; y += 20) {
        const off = (Math.floor(y / 20) % 2) * 16
        for (let x = -off; x < w; x += 32) { ctx.fillRect(x + 1, y + 1, 30, 17) }
      }
      ctx.fillStyle = '#1a3a1a'
      const mossSpots = [[20,30],[80,50],[150,20],[220,60],[300,35],[380,55],[60,100],[180,90],[320,110]]
      mossSpots.forEach(([mx, my]) => {
        ctx.beginPath(); ctx.ellipse(mx, my, 8, 4, 0, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(mx + 4, my - 3, 5, 3, 0.3, 0, Math.PI * 2); ctx.fill()
      })
      ctx.fillStyle = '#204020'
      for (let i = 0; i < 8; i++) {
        const dx = 40 + i * 60, dy = 15 + Math.sin(i) * 10
        ctx.fillRect(dx, dy, 2, 12 + (i % 3) * 6)
        ctx.beginPath(); ctx.arc(dx + 1, dy + 14 + (i % 3) * 6, 2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#050d05'
      ctx.beginPath(); ctx.rect(w * 0.45, h * 0.2, 80, h * 0.6); ctx.fill()
      ctx.fillStyle = '#040a04'
      ctx.beginPath(); ctx.arc(w * 0.45 + 40, h * 0.2, 40, Math.PI, 0); ctx.fill()
      ctx.fillStyle = '#1a4a1a44'
      ;[[w * 0.2, h * 0.75], [w * 0.75, h * 0.72]].forEach(([mx, my]) => {
        ctx.beginPath(); ctx.ellipse(mx, my, 6, 10, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#2a6a2a33'
        ctx.beginPath(); ctx.ellipse(mx, my - 8, 10, 5, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#1a4a1a44'
      })
      ;[w * 0.15, w * 0.85].forEach(tx => {
        ctx.fillStyle = '#3a1a00'; ctx.fillRect(tx - 3, h * 0.15, 6, 15)
        const tg = ctx.createRadialGradient(tx, h * 0.15, 0, tx, h * 0.15, 18)
        tg.addColorStop(0, 'rgba(100,200,50,0.35)'); tg.addColorStop(1, 'transparent')
        ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tx, h * 0.15, 18, 0, Math.PI * 2); ctx.fill()
      })
    },
    particles: [
      { color: '#204020', size: 2, count: 6, speedY: -0.4, speedX: 0.1, life: 3000 },
      { color: '#304830', size: 1, count: 4, speedY: -0.2, speedX: 0,   life: 4000 },
    ],
    enemyPool: ['mystery-slime', 'basement-rat', 'mystery-creature'],
    elitePool: ['forgotten-thing'],
    miniboss: 'rat-king',
    boss: 'johno',
    stages: 20,
    storyText: ["Nobody's been down here.", "Not even Johno's parents. The slimes seem... organised."],
  },

  // ── ZONE 2: BBI COURT — AUCHENFLOWER ─────────────────────────────────────
  {
    id: 1,
    name: 'ZONE 2 — BBI COURT',
    label: 'BBI COURT — AUCHENFLOWER',
    palette: {
      bg: '#06080e', panel: '#0e1018', panel2: '#141620',
      border: '#202840', borderHi: '#304070',
      accent: '#f0a020', accent2: '#e06010',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#1a1a14 0,#1a1a14 40px,#181812 40px,#181812 80px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#02030a'); g.addColorStop(0.7, '#05080f'); g.addColorStop(1, '#080c14')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 40; i++) {
        const sx = Math.random() * w, sy = Math.random() * (h * 0.55)
        ctx.fillRect(sx, sy, 1, 1)
      }
      ctx.strokeStyle = '#f0a02044'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.55); ctx.lineTo(w / 2, h - 36); ctx.stroke()
      ctx.beginPath(); ctx.arc(w / 2, h * 0.75, 30, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(w * 0.8, h - 36, 50, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke()
      ;[[w * 0.1, 0], [w * 0.9, 0]].forEach(([lx, ly]) => {
        const cone = ctx.createRadialGradient(lx, ly, 0, lx, ly, h * 0.8)
        cone.addColorStop(0, 'rgba(255,180,50,0.15)')
        cone.addColorStop(0.5, 'rgba(255,160,30,0.05)')
        cone.addColorStop(1, 'transparent')
        ctx.fillStyle = cone
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - 80, h); ctx.lineTo(lx + 80, h); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#f0a020'; ctx.fillRect(lx - 4, ly, 8, 6)
      })
      ctx.fillStyle = '#080c14'
      for (let i = 0; i < w; i += 10) { ctx.fillRect(i, h * 0.45, 4, h * 0.15 + Math.sin(i * 0.3) * 4) }
    },
    particles: [
      { color: '#f0a02055', size: 1, count: 3, speedY: -0.3, speedX: 0.2, life: 2500 },
    ],
    enemyPool: ['court-slime', 'overtime-ghost'],
    elitePool: ['aggressive-ref'],
    miniboss: 'half-time-beast',
    boss: 'the-coach',
    stages: 20,
    storyText: ["Someone's been using this court.", "Big X has been here since 6am. Nobody asked him to guard it."],
  },

  // ── ZONE 3: UQ ST LUCIA ──────────────────────────────────────────────────
  {
    id: 2,
    name: 'ZONE 3 — UQ ST LUCIA',
    label: 'UQ ST LUCIA CAMPUS',
    palette: {
      bg: '#080608', panel: '#12100e', panel2: '#1a1814',
      border: '#302820', borderHi: '#605040',
      accent: '#d4a040', accent2: '#a07030',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#1a1610 0,#1a1610 16px,#201c14 16px,#201c14 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#1a0e04'); g.addColorStop(0.5, '#0e0a08'); g.addColorStop(1, '#080604')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#120e08'
      const bw = w * 0.6, bx = w * 0.2
      ctx.fillRect(bx, h * 0.15, bw, h * 0.65)
      ctx.fillStyle = '#06040a'
      for (let i = 0; i < 4; i++) {
        const wx = bx + 20 + i * (bw / 4), wy = h * 0.2
        ctx.fillRect(wx, wy + 8, 14, 24)
        ctx.beginPath(); ctx.arc(wx + 7, wy + 8, 7, Math.PI, 0); ctx.fill()
      }
      ctx.fillStyle = '#0e0a06'
      for (let i = 0; i < 5; i++) { ctx.fillRect(bx + i * (bw / 5) + 10, h * 0.4, 8, h * 0.4) }
      ctx.fillStyle = '#0c1008'
      ctx.fillRect(0, h * 0.7, w, h * 0.3 - 36)
      ;[[w * 0.05, h * 0.5], [w * 0.9, h * 0.45]].forEach(([tx, ty]) => {
        ctx.fillStyle = '#0a1008'; ctx.fillRect(tx - 3, ty, 6, h - ty - 36)
        ctx.fillStyle = '#0e1a0c'
        ctx.beginPath(); ctx.arc(tx, ty, 18, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(tx - 5, ty + 8, 13, 0, Math.PI * 2); ctx.fill()
      })
      const sg = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, 80)
      sg.addColorStop(0, 'rgba(200,140,40,0.12)'); sg.addColorStop(1, 'transparent')
      ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h)
    },
    particles: [
      { color: '#d4a04033', size: 1, count: 3, speedY: -0.15, speedX: 0.1, life: 5000 },
    ],
    enemyPool: ['stressed-postgrad', 'late-assignment'],
    elitePool: ['thesis-demon'],
    miniboss: 'grad-overseer',
    boss: 'the-examiner',
    stages: 20,
    storyText: ["The campus is overrun.", "Connor was supposed to be here. Nobody has seen him all semester."],
  },

  // ── ZONE 4: FORTITUDE VALLEY — EDRIAN'S ZONE ─────────────────────────────
  {
    id: 3,
    name: 'ZONE 4 — FORTITUDE VALLEY',
    label: 'FORTITUDE VALLEY',
    palette: {
      bg: '#08040e', panel: '#110818', panel2: '#180c20',
      border: '#2a1040', borderHi: '#502080',
      accent: '#e020ff', accent2: '#ff6020',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0e0814 0,#0e0814 16px,#120c18 16px,#120c18 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#04020a'); g.addColorStop(1, '#0a0610')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      const buildings = [
        [0, h * 0.2, 60], [80, h * 0.35, 40], [140, h * 0.15, 50], [210, h * 0.28, 35],
        [260, h * 0.1, 70], [350, h * 0.32, 45], [410, h * 0.22, 55], [w - 60, h * 0.18, 60],
      ]
      buildings.forEach(([bx, by, bw]) => {
        ctx.fillStyle = '#080410'; ctx.fillRect(bx, by, bw, h - by)
        const colors = ['#e020ff22', '#20e0ff22', '#ff204022', '#ff602022']
        for (let wy = by + 8; wy < h * 0.7; wy += 14) {
          for (let wx = bx + 4; wx < bx + bw - 8; wx += 10) {
            if (Math.random() > 0.4) {
              ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
              ctx.fillRect(wx, wy, 6, 8)
            }
          }
        }
      })
      // Taco van
      const vx = w * 0.52, vy = h * 0.42, vw = 130, vh = 55
      ctx.fillStyle = '#1a0a04'; ctx.fillRect(vx, vy, vw, vh)
      ctx.fillStyle = '#140804'; ctx.fillRect(vx + vw - 30, vy - 10, 30, vh + 10)
      ctx.fillStyle = '#20e0ff18'; ctx.fillRect(vx + vw - 26, vy - 7, 22, 22)
      ctx.fillStyle = '#08040e'; ctx.fillRect(vx + 8, vy + 6, 50, 22)
      ctx.strokeStyle = '#ff6020'; ctx.lineWidth = 1; ctx.strokeRect(vx + 8, vy + 6, 50, 22)
      ctx.fillStyle = '#ff602088'; ctx.fillRect(vx + 12, vy + 10, 42, 14)
      ctx.fillStyle = '#ff6020cc'
      ctx.font = "bold 7px 'Press Start 2P', monospace"
      ctx.textAlign = 'left'; ctx.fillText('TACOS', vx + 14, vy + 20)
      const tg = ctx.createRadialGradient(vx + 33, vy + 17, 0, vx + 33, vy + 17, 40)
      tg.addColorStop(0, 'rgba(255,96,32,0.25)'); tg.addColorStop(1, 'transparent')
      ctx.fillStyle = tg; ctx.fillRect(vx - 10, vy - 10, vw + 20, vh + 20)
      ctx.fillStyle = '#0a0a0a'
      ctx.beginPath(); ctx.arc(vx + 20, vy + vh, 10, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(vx + vw - 20, vy + vh, 10, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(vx + 20, vy + vh, 10, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(vx + vw - 20, vy + vh, 10, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#c02010'
      ctx.beginPath(); ctx.moveTo(vx + 4, vy); ctx.lineTo(vx + 4, vy - 8); ctx.lineTo(vx + 62, vy - 8); ctx.lineTo(vx + 62, vy); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#e03018'
      for (let i = 0; i < 5; i++) { ctx.fillRect(vx + 4 + i * 12, vy - 8, 6, 8) }
      ctx.font = '10px serif'
      ctx.fillText('🌮', vx + 5, vy - 14)
      ctx.fillText('🌮', vx + 70, vy - 18)
      ctx.fillStyle = '#2a1008'; ctx.fillRect(vx + 4, vy + 28, 54, 4)
      // Phone screen glow (Edrian)
      const px = vx - 50, py = vy + 10
      ctx.fillStyle = '#0a0a12'; ctx.fillRect(px, py, 18, 28)
      ctx.strokeStyle = '#404060'; ctx.lineWidth = 1; ctx.strokeRect(px, py, 18, 28)
      ctx.fillStyle = '#ff004444'; ctx.fillRect(px + 1, py + 2, 16, 26)
      const pg = ctx.createRadialGradient(px + 9, py + 14, 0, px + 9, py + 14, 30)
      pg.addColorStop(0, 'rgba(255,0,80,0.3)'); pg.addColorStop(0.4, 'rgba(0,200,255,0.15)'); pg.addColorStop(1, 'transparent')
      ctx.fillStyle = pg; ctx.fillRect(px - 20, py - 20, 60, 70)
      ctx.fillStyle = '#ff0044'
      ctx.beginPath(); ctx.arc(px + 16, py - 2, 3, 0, Math.PI * 2); ctx.fill()
      // Brainrot text
      ctx.font = "6px 'Press Start 2P', monospace"
      ctx.textAlign = 'left'
      ;[
        ['#ff0044', 'TUNG TUNG TUNG', w * 0.05, h * 0.22],
        ['#ff6020', 'BOMBARDIRO',     w * 0.68, h * 0.28],
        ['#e020ff', 'TRALALERO',      w * 0.12, h * 0.38],
        ['#20e0ff', 'BRRR BRRR',      w * 0.70, h * 0.42],
        ['#ffff00', 'LIRILI LARILA',  w * 0.04, h * 0.52],
      ].forEach(([c, t, tx, ty]) => {
        ctx.fillStyle = (c as string) + '66'; ctx.fillText(t as string, tx as number, ty as number)
      })
      ;[['#e020ff', w * 0.25, h * 0.3], ['#20e0ff', w * 0.7, h * 0.25], ['#ff2044', w * 0.45, h * 0.2]].forEach(([c, sx, sy]) => {
        const ng = ctx.createRadialGradient(sx as number, sy as number, 0, sx as number, sy as number, 25)
        ng.addColorStop(0, (c as string) + '44'); ng.addColorStop(1, 'transparent')
        ctx.fillStyle = ng; ctx.fillRect(0, 0, w, h)
      })
      const rg = ctx.createLinearGradient(0, h * 0.72, 0, h)
      rg.addColorStop(0, '#e020ff0e'); rg.addColorStop(0.5, '#ff60200a'); rg.addColorStop(1, 'transparent')
      ctx.fillStyle = rg; ctx.fillRect(0, h * 0.72, w, h)
    },
    particles: [
      { color: '#e020ff44', size: 1, count: 4, speedY: -0.5, speedX:  0.3, life: 2000 },
      { color: '#ff602033', size: 1, count: 3, speedY: -0.6, speedX: -0.2, life: 1800 },
      { color: '#20e0ff22', size: 1, count: 2, speedY: -0.3, speedX:  0.1, life: 2500 },
    ],
    enemyPool: ['neon-goblin', 'brainrot-specter'],
    elitePool: ['the-bouncer'],
    miniboss: 'taco-van-guardian',
    boss: 'edrian',
    stages: 20,
    storyText: ["Wolton Industries has a front business in the Valley.", "The signage is in Spanish for some reason."],
  },

  // ── ZONE 5: SUNCORP STADIUM ───────────────────────────────────────────────
  {
    id: 4,
    name: 'ZONE 5 — SUNCORP STADIUM',
    label: 'SUNCORP STADIUM',
    palette: {
      bg: '#040810', panel: '#080e18', panel2: '#0c1420',
      border: '#102030', borderHi: '#204060',
      accent: '#20a0ff', accent2: '#1060c0',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0c1e0c 0,#0c1e0c 20px,#0e220e 20px,#0e220e 40px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#020508'); g.addColorStop(1, '#040a10')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#060c10'
      ctx.beginPath()
      ctx.moveTo(0, h * 0.6); ctx.quadraticCurveTo(w / 2, h * 0.2, w, h * 0.6)
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill()
      ;[[w * 0.05, h * 0.05], [w * 0.25, h * 0.02], [w * 0.75, h * 0.02], [w * 0.95, h * 0.05]].forEach(([lx, ly]) => {
        const cone = ctx.createRadialGradient(lx, ly, 0, lx, ly, h)
        cone.addColorStop(0, 'rgba(200,230,255,0.2)')
        cone.addColorStop(0.4, 'rgba(200,230,255,0.06)')
        cone.addColorStop(1, 'transparent')
        ctx.fillStyle = cone
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - 120, h); ctx.lineTo(lx + 120, h); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#20a0ff'; ctx.fillRect(lx - 4, ly, 8, 6)
      })
      ctx.fillStyle = '#080e16'
      for (let i = 0; i < w; i += 6) {
        ctx.fillRect(i, h * 0.35 + Math.sin(i * 0.4) * 4 + Math.cos(i * 0.7) * 3, 4, h * 0.15)
      }
      ctx.strokeStyle = '#20a0ff22'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, h * 0.68); ctx.lineTo(w, h * 0.68); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.68); ctx.lineTo(w / 2, h - 36); ctx.stroke()
    },
    particles: [
      { color: '#20a0ff33', size: 1, count: 4, speedY: 0.3, speedX: 0.1, life: 3000 },
    ],
    enemyPool: ['overconfident-forward', 'penalty-wraith'],
    elitePool: ['rowdy-fan'],
    miniboss: 'the-referee',
    boss: 'head-coach',
    stages: 20,
    storyText: ["Seb's been recruited as Wolton's enforcer.", "Technically the most dangerous person in the group. Practically, he just vibes."],
  },

  // ── ZONE 6: CHERMSIDE WESTFIELD ───────────────────────────────────────────
  {
    id: 5,
    name: 'ZONE 6 — CHERMSIDE WESTFIELD',
    label: 'CHERMSIDE WESTFIELD',
    palette: {
      bg: '#0c0c10', panel: '#141418', panel2: '#1c1c22',
      border: '#282830', borderHi: '#484860',
      accent: '#ffe040', accent2: '#c0a010',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#18181e 0,#18181e 32px,#1e1e24 32px,#1e1e24 64px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#0a0a0e'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 1
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.6); ctx.stroke() }
      for (let y = 0; y < h * 0.6; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      const lights: [number, number][] = [[w * 0.15, 20], [w * 0.4, 20], [w * 0.65, 20], [w * 0.88, 20]]
      lights.forEach(([lx, ly]) => {
        ctx.fillStyle = '#ffe04022'; ctx.fillRect(lx - 30, ly, 60, 8)
        const lg = ctx.createRadialGradient(lx, ly + 4, 0, lx, ly + 4, h * 0.8)
        lg.addColorStop(0, 'rgba(255,230,60,0.12)')
        lg.addColorStop(0.3, 'rgba(255,230,60,0.04)')
        lg.addColorStop(1, 'transparent')
        ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h)
      })
      ctx.fillStyle = '#0e0e14'
      ctx.fillRect(0, h * 0.15, w, h * 0.55)
      ;[[w * 0.05, h * 0.2], [w * 0.35, h * 0.2], [w * 0.6, h * 0.2], [w * 0.8, h * 0.2]].forEach(([sx, sy], i) => {
        const colors = ['#ffe04018', '#ff804018', '#40ff8018', '#4080ff18']
        ctx.fillStyle = colors[i % 4]; ctx.fillRect(sx, sy, 70, h * 0.3)
        ctx.strokeStyle = colors[i % 4].replace('18', '44'); ctx.lineWidth = 1
        ctx.strokeRect(sx, sy, 70, h * 0.3)
      })
      ctx.strokeStyle = '#1e1e26'; ctx.lineWidth = 1
      for (let x = 0; x < w; x += 48) { ctx.beginPath(); ctx.moveTo(x, h * 0.7); ctx.lineTo(x, h); ctx.stroke() }
      ctx.beginPath(); ctx.moveTo(0, h * 0.7 + 24); ctx.lineTo(w, h * 0.7 + 24); ctx.stroke()
    },
    particles: [
      { color: '#ffe04022', size: 1, count: 2, speedY: 0.1, speedX: 0, life: 6000 },
    ],
    enemyPool: ['retail-worker', 'frenzied-shopper'],
    elitePool: ['store-manager'],
    miniboss: 'zone-manager',
    boss: 'mall-security',
    stages: 20,
    storyText: ["Hayden is running Wolton's supply chain out of a JB Hi-Fi.", "His glasses prescription is two years out of date."],
  },

  // ── ZONE 7: PA HOSPITAL — PHYSIO WARD ────────────────────────────────────
  {
    id: 6,
    name: 'ZONE 7 — PA HOSPITAL',
    label: 'PA HOSPITAL — PHYSIO WARD',
    palette: {
      bg: '#080e0a', panel: '#0e1610', panel2: '#141e16',
      border: '#1e3020', borderHi: '#2a5030',
      accent: '#40e0a0', accent2: '#20a060',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0e1810 0,#0e1810 32px,#121c14 32px,#121c14 64px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#06100a'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#0e1e14'; ctx.lineWidth = 1
      for (let x = 0; x < w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.65); ctx.stroke() }
      for (let y = 0; y < h * 0.65; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      ;[[w * 0.2, 15], [w * 0.5, 15], [w * 0.8, 15]].forEach(([lx, ly]) => {
        ctx.fillStyle = '#40e0a030'; ctx.fillRect(lx - 40, ly, 80, 4)
        const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, h * 0.9)
        lg.addColorStop(0, 'rgba(50,200,130,0.1)'); lg.addColorStop(1, 'transparent')
        ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h)
      })
      ctx.fillStyle = '#0c1a10'
      ctx.fillRect(w * 0.55, h * 0.45, 100, 30)
      ctx.fillRect(w * 0.55, h * 0.35, 20, h * 0.1 + 30)
      ctx.fillStyle = '#0e1e14'
      ctx.fillRect(w * 0.1, h * 0.2, 30, 60)
      ctx.fillRect(w * 0.85, h * 0.15, 25, 50)
      ctx.fillStyle = '#c0404040'
      ctx.fillRect(w * 0.1 + 11, h * 0.25, 8, 20)
      ctx.fillRect(w * 0.1 + 5, h * 0.31, 20, 8)
      ctx.strokeStyle = '#142018'; ctx.lineWidth = 1
      for (let x = 0; x < w; x += 30) {
        for (let y = h * 0.7; y < h; y += 30) { ctx.strokeRect(x, y, 30, 30) }
      }
    },
    particles: [
      { color: '#40e0a022', size: 1, count: 2, speedY: -0.1, speedX: 0, life: 7000 },
    ],
    enemyPool: ['physio-foam-roller', 'confused-intern'],
    elitePool: ['ward-sentinel'],
    miniboss: 'head-nurse',
    boss: 'chief-surgeon',
    stages: 20,
    storyText: ["Burgo was supposed to be head of security.", "He's been on modified duties since week one."],
  },

  // ── ZONE 8: WOLTON INDUSTRIES LOBBY ──────────────────────────────────────
  {
    id: 7,
    name: 'ZONE 8 — WOLTON INDUSTRIES HQ',
    label: 'WOLTON INDUSTRIES — LOBBY',
    palette: {
      bg: '#040608', panel: '#080c12', panel2: '#0e1218',
      border: '#182030', borderHi: '#203040',
      accent: '#c0d0ff', accent2: '#4060c0',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0c1018 0,#0c1018 40px,#0e1420 40px,#0e1420 80px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#020408'); g.addColorStop(1, '#060a10')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#c0d0ff08'; ctx.lineWidth = 1
      for (let x = 0; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.75); ctx.stroke() }
      for (let y = 0; y < h * 0.75; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      const rg = ctx.createLinearGradient(0, 0, w, h * 0.5)
      rg.addColorStop(0, 'rgba(100,140,255,0.04)')
      rg.addColorStop(0.5, 'rgba(80,120,220,0.02)')
      rg.addColorStop(1, 'transparent')
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#0c1420'; ctx.fillRect(w * 0.3, h * 0.55, w * 0.4, h * 0.12)
      ctx.strokeStyle = '#4060c040'; ctx.lineWidth = 2
      ctx.strokeRect(w * 0.3, h * 0.55, w * 0.4, h * 0.12)
      ctx.fillStyle = '#c0d0ff18'; ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'center'; ctx.fillText('WOLTON INDUSTRIES', w / 2, h * 0.3)
      ctx.textAlign = 'left'
      const mf = ctx.createLinearGradient(0, h * 0.7, 0, h)
      mf.addColorStop(0, 'rgba(100,140,255,0.06)'); mf.addColorStop(1, 'transparent')
      ctx.fillStyle = mf; ctx.fillRect(0, h * 0.7, w, h)
      ;[w * 0.1, w * 0.9].forEach(cx => {
        ctx.fillStyle = '#080e16'; ctx.fillRect(cx - 8, 0, 16, h * 0.75)
        ctx.strokeStyle = '#c0d0ff18'; ctx.lineWidth = 1; ctx.strokeRect(cx - 8, 0, 16, h * 0.75)
      })
    },
    particles: [
      { color: '#c0d0ff18', size: 1, count: 2, speedY: -0.05, speedX: 0, life: 8000 },
    ],
    enemyPool: ['corporate-drone', 'damo'],
    elitePool: ['security-golem'],
    miniboss: 'hr-director',
    boss: 'the-ceo',
    stages: 20,
    storyText: ["This is it.", "32 floors of glass and Fraser's ego."],
  },

  // ── ZONE 9: WOLTON HQ 32ND FLOOR ─────────────────────────────────────────
  {
    id: 8,
    name: 'ZONE 9 — WOLTON HQ 32ND FLOOR',
    label: 'WOLTON HQ — 32ND FLOOR',
    palette: {
      bg: '#020408', panel: '#060810', panel2: '#0a0c14',
      border: '#141830', borderHi: '#283060',
      accent: '#ff4040', accent2: '#c02020',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#08090e 0,#08090e 40px,#0a0c12 40px,#0a0c12 80px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#020306'; ctx.fillRect(0, 0, w, h)
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6)
      sky.addColorStop(0, '#020306'); sky.addColorStop(1, '#040818')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * 0.6)
      const blds: [number, number, number][] = [
        [0, h*0.25, 40], [50, h*0.4, 30], [90, h*0.1, 45], [145, h*0.3, 25],
        [180, h*0.05, 55], [245, h*0.2, 35], [290, h*0.15, 40], [340, h*0.32, 28],
        [378, h*0.08, 50], [438, h*0.22, 32], [480, h*0.12, 48], [538, h*0.28, 35],
        [w - 50, h*0.18, 50], [w - 100, h*0.35, 30],
      ]
      blds.forEach(([bx, by, bw]) => {
        ctx.fillStyle = '#040610'; ctx.fillRect(bx, by, bw, h - by)
        for (let wy = by + 6; wy < h * 0.55; wy += 9) {
          for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) {
            if (Math.random() > 0.35) {
              ctx.fillStyle = Math.random() > 0.8 ? '#ffe04022' : '#ff804012'
              ctx.fillRect(wx, wy, 4, 5)
            }
          }
        }
      })
      const hg = ctx.createLinearGradient(0, h * 0.5, 0, h * 0.65)
      hg.addColorStop(0, 'rgba(255,40,40,0.12)'); hg.addColorStop(1, 'transparent')
      ctx.fillStyle = hg; ctx.fillRect(0, h * 0.5, w, h * 0.15)
      ctx.strokeStyle = '#141830'; ctx.lineWidth = 3
      for (let x = 0; x < w; x += w / 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.7); ctx.stroke() }
      const fl = ctx.createRadialGradient(w / 2, h * 0.9, 0, w / 2, h * 0.9, 100)
      fl.addColorStop(0, 'rgba(255,40,40,0.1)'); fl.addColorStop(1, 'transparent')
      ctx.fillStyle = fl; ctx.fillRect(0, h * 0.7, w, h)
    },
    particles: [
      { color: '#ff404033', size: 1, count: 4, speedY: -0.4, speedX:  0.2, life: 2000 },
      { color: '#ff808022', size: 1, count: 2, speedY: -0.2, speedX: -0.1, life: 3000 },
    ],
    enemyPool: ['fraser', 'red-tape-wraith'],
    elitePool: ['final-boss-drone'],
    miniboss: 'executive-enforcer',
    boss: 'wolton-prime',
    stages: 20,
    storyText: ["You shouldn't be in here.", "You are in here anyway."],
  },
]
