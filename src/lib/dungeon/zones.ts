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

  // ── ZONE 9: WOLTON DEEP LABS I ───────────────────────────────────────────
  {
    id: 9,
    name: "ZONE 10 — WOLTON DEEP LABS",
    label: "DEEP LABS I",
    palette: {
      bg: '#060e0a', panel: '#0c160e', panel2: '#101a12',
      border: '#1a3020', borderHi: '#2a5030',
      accent: '#40ff80', accent2: '#20c050',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0c180e 0,#0c180e 16px,#0e1e10 16px,#0e1e10 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#050d07'); g.addColorStop(0.7, '#080f09'); g.addColorStop(1, '#0a120b')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Tile grid
      ctx.strokeStyle = '#0f1e12'; ctx.lineWidth = 1
      for (let y = 0; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      // Overhead lights - bright rectangles
      ctx.fillStyle = '#20ff6018'
      for (let x = 20; x < w - 20; x += 60) {
        ctx.fillRect(x, 2, 30, 6)
        const lg = ctx.createLinearGradient(x, 8, x, h * 0.5)
        lg.addColorStop(0, '#20ff6010'); lg.addColorStop(1, 'transparent')
        ctx.fillStyle = lg; ctx.fillRect(x, 8, 30, h * 0.4)
        ctx.fillStyle = '#20ff6018'
      }
      // Lab equipment silhouettes on walls
      ctx.fillStyle = '#0e1c10'
      for (let x = 10; x < w - 40; x += 50) {
        const eh = 16 + (x % 3) * 8
        ctx.fillRect(x, h * 0.12, 35, eh)
        ctx.fillStyle = '#18ff5008'; ctx.fillRect(x + 4, h * 0.12 + 3, 10, 6)
        ctx.fillStyle = '#0e1c10'
      }
    },
    particles: [
      { color: '#20ff5022', size: 1, count: 4, speedY: -0.3, speedX: 0.1, life: 3000 },
    ],
    enemyPool: ['corrupted-slime', 'rogue-drone', 'lab-specimen'],
    elitePool: ['failed-clone', 'security-protocol'],
    miniboss: 'containment-breach',
    boss: 'dr-01',
    stages: 20,
    storyText: ["The labs beneath Wolton go deeper than the records show.", "Something was being grown down here."],
  },

  // ── ZONE 10: WOLTON DEEP LABS II ─────────────────────────────────────────
  {
    id: 10,
    name: "ZONE 11 — WOLTON DEEP LABS II",
    label: "DEEP LABS II",
    palette: {
      bg: '#080e06', panel: '#0e1608', panel2: '#121a0c',
      border: '#203010', borderHi: '#305018',
      accent: '#80ff40', accent2: '#50c020',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0e1a08 0,#0e1a08 16px,#101e0c 16px,#101e0c 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#060c04'); g.addColorStop(0.6, '#080e06'); g.addColorStop(1, '#0a1208')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Cracked tile grid
      ctx.strokeStyle = '#0f1c09'; ctx.lineWidth = 1
      for (let y = 0; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      // Cracks
      ctx.strokeStyle = '#60ff2015'; ctx.lineWidth = 1
      for (let i = 0; i < 6; i++) {
        const cx = (i * 67 + 20) % w
        const cy = (i * 43 + 10) % (h * 0.6)
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 15, cy + 20); ctx.lineTo(cx + 8, cy + 35); ctx.stroke()
      }
      // Green fluid seeping from walls
      for (let x = 0; x < w; x += 40) {
        const fl = ctx.createLinearGradient(x, 0, x, h * 0.4)
        fl.addColorStop(0, '#80ff2020'); fl.addColorStop(1, 'transparent')
        ctx.fillStyle = fl; ctx.fillRect(x, 0, 8, h * 0.4)
      }
    },
    particles: [
      { color: '#60ff2030', size: 2, count: 5, speedY: -0.2, speedX: 0.05, life: 4000 },
      { color: '#40c01020', size: 1, count: 3, speedY: 0.1, speedX: 0, life: 5000 },
    ],
    enemyPool: ['corrupted-slime', 'lab-specimen', 'failed-clone'],
    elitePool: ['failed-clone', 'security-protocol'],
    miniboss: 'alpha-specimen',
    boss: 'the-specimen',
    stages: 20,
    storyText: ["The containment held. For a while.", "It doesn't hold anymore."],
  },

  // ── ZONE 11: WOLTON DEEP LABS III ────────────────────────────────────────
  {
    id: 11,
    name: "ZONE 12 — WOLTON DEEP LABS III",
    label: "DEEP LABS III",
    palette: {
      bg: '#0a0e04', panel: '#141804', panel2: '#181e06',
      border: '#283008', borderHi: '#405010',
      accent: '#c0ff20', accent2: '#80c010',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#141804 0,#141804 16px,#181e06 16px,#181e06 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#080c02'); g.addColorStop(0.5, '#0a0e04'); g.addColorStop(1, '#0c1006')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Fully corrupted - green everywhere
      ctx.fillStyle = '#c0ff1008'
      ctx.fillRect(0, 0, w, h)
      // Corrupted walls
      for (let x = 0; x < w; x += 16) {
        for (let y = 0; y < h * 0.8; y += 16) {
          if (Math.random() > 0.6) {
            ctx.fillStyle = `rgba(180,255,${Math.floor(Math.random()*80)},0.06)`
            ctx.fillRect(x, y, 14, 14)
          }
        }
      }
      // Pulsing green core light
      const cl = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, w * 0.4)
      cl.addColorStop(0, '#80ff0010'); cl.addColorStop(1, 'transparent')
      ctx.fillStyle = cl; ctx.fillRect(0, 0, w, h)
    },
    particles: [
      { color: '#a0ff1040', size: 2, count: 8, speedY: -0.4, speedX: 0.2, life: 2500 },
      { color: '#60c00820', size: 1, count: 4, speedY: -0.1, speedX: -0.1, life: 4000 },
    ],
    enemyPool: ['lab-specimen', 'failed-clone', 'security-protocol'],
    elitePool: ['failed-clone', 'security-protocol'],
    miniboss: 'core-guardian',
    boss: 'nexus',
    stages: 20,
    storyText: ["The nexus was never meant to become conscious.", "It did anyway."],
  },

  // ── ZONE 12: WOLTON CORRUPTION I ─────────────────────────────────────────
  {
    id: 12,
    name: "ZONE 13 — WOLTON CORRUPTION",
    label: "CORRUPTION I",
    palette: {
      bg: '#0e0a04', panel: '#180e06', panel2: '#1e1408',
      border: '#302008', borderHi: '#503010',
      accent: '#f0c040', accent2: '#c09020',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#181006 0,#181006 16px,#1c1408 16px,#1c1408 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#0c0802'); g.addColorStop(0.6, '#0e0a04'); g.addColorStop(1, '#100c06')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Corporate Wolton HQ with subtle cracks
      ctx.fillStyle = '#1a1008'
      for (let y = h * 0.1; y < h * 0.6; y += 20) {
        ctx.fillRect(10, y, w - 20, 14)
      }
      // Gold accents
      ctx.strokeStyle = '#f0c04020'; ctx.lineWidth = 2
      ctx.strokeRect(8, h * 0.08, w - 16, h * 0.55)
      // Subtle cracks
      ctx.strokeStyle = '#c0300010'; ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        const cx = i * w / 4 + 20
        ctx.beginPath(); ctx.moveTo(cx, h * 0.1); ctx.lineTo(cx + 10, h * 0.3); ctx.stroke()
      }
      // Glitching signage
      ctx.fillStyle = '#f0c04015'
      ctx.fillRect(w * 0.3, h * 0.05, w * 0.4, 12)
    },
    particles: [
      { color: '#f0c04025', size: 1, count: 3, speedY: -0.3, speedX: 0.1, life: 3000 },
    ],
    enemyPool: ['fractured-guard', 'void-intern', 'glitch-entity'],
    elitePool: ['broken-construct', 'reality-tear'],
    miniboss: 'the-fracture',
    boss: 'shard',
    stages: 20,
    storyText: ["Wolton HQ looked different from the inside.", "From this side, it looks like it's coming apart."],
  },

  // ── ZONE 13: WOLTON CORRUPTION II ────────────────────────────────────────
  {
    id: 13,
    name: "ZONE 14 — WOLTON CORRUPTION II",
    label: "CORRUPTION II",
    palette: {
      bg: '#0e0608', panel: '#18080e', panel2: '#1c0c12',
      border: '#301018', borderHi: '#501828',
      accent: '#c04080', accent2: '#902060',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#18080c 0,#18080c 16px,#1c0c10 16px,#1c0c10 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#0c0406'); g.addColorStop(0.5, '#0e0608'); g.addColorStop(1, '#10080a')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Half Wolton, half void
      ctx.fillStyle = '#180810'
      for (let y = h * 0.1; y < h * 0.5; y += 20) {
        ctx.fillRect(10, y, (w - 20) * 0.6, 14)
      }
      // Void seeping from right side
      const vg = ctx.createLinearGradient(w * 0.5, 0, w, 0)
      vg.addColorStop(0, 'transparent'); vg.addColorStop(1, '#c0204020')
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h)
      // Corrupted gold shards
      ctx.fillStyle = '#c04080' + '18'
      for (let i = 0; i < 8; i++) {
        const sx = (i * 53 + 15) % w; const sy = (i * 37) % (h * 0.7)
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, sy - 10); ctx.lineTo(sx + 12, sy); ctx.closePath(); ctx.fill()
      }
    },
    particles: [
      { color: '#c0204030', size: 2, count: 5, speedY: -0.3, speedX: -0.1, life: 3000 },
      { color: '#f0c04015', size: 1, count: 2, speedY: -0.2, speedX: 0.1, life: 4000 },
    ],
    enemyPool: ['glitch-entity', 'broken-construct', 'reality-tear'],
    elitePool: ['broken-construct', 'reality-tear'],
    miniboss: 'void-architect',
    boss: 'the-architect',
    stages: 20,
    storyText: ["The architecture of this place no longer makes sense.", "Rooms lead to other rooms that shouldn't exist."],
  },

  // ── ZONE 14: WOLTON CORRUPTION III ───────────────────────────────────────
  {
    id: 14,
    name: "ZONE 15 — WOLTON CORRUPTION III",
    label: "CORRUPTION III",
    palette: {
      bg: '#08040e', panel: '#0e0618', panel2: '#12081e',
      border: '#200830', borderHi: '#381050',
      accent: '#8020c0', accent2: '#5010a0',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0e0818 0,#0e0818 16px,#120c1e 16px,#120c1e 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#060210'); g.addColorStop(0.5, '#08040e'); g.addColorStop(1, '#0a0612')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Barely recognisable corporate structure - mostly void
      ctx.fillStyle = '#180830'
      ctx.fillRect(10, h * 0.15, 40, h * 0.4)
      ctx.fillRect(w - 50, h * 0.2, 40, h * 0.35)
      // Purple void fill
      const pvg = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.5)
      pvg.addColorStop(0, '#6010a020'); pvg.addColorStop(1, 'transparent')
      ctx.fillStyle = pvg; ctx.fillRect(0, 0, w, h)
      // Echo reflection fragments
      ctx.strokeStyle = '#8020c018'; ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        ctx.beginPath()
        ctx.moveTo((i * 40 + 10) % w, h * 0.2)
        ctx.lineTo(((i * 40 + 10) % w) + 30, h * 0.5)
        ctx.stroke()
      }
    },
    particles: [
      { color: '#7020c035', size: 2, count: 6, speedY: -0.4, speedX: 0.15, life: 3500 },
      { color: '#5010a020', size: 1, count: 3, speedY: -0.2, speedX: -0.1, life: 5000 },
    ],
    enemyPool: ['broken-construct', 'reality-tear', 'glitch-entity'],
    elitePool: ['broken-construct', 'reality-tear'],
    miniboss: 'mirror-shard',
    boss: 'echo',
    stages: 20,
    storyText: ["You can hear your own footsteps coming from the wrong direction.", "Something is watching. It has your face."],
  },

  // ── ZONE 15: VOID DESCENT I ───────────────────────────────────────────────
  {
    id: 15,
    name: "ZONE 16 — VOID DESCENT",
    label: "VOID DESCENT I",
    palette: {
      bg: '#020a0c', panel: '#04100e', panel2: '#061412',
      border: '#0c2820', borderHi: '#184038',
      accent: '#20c0a0', accent2: '#10a080',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#040e0c 0,#040e0c 16px,#061210 16px,#061210 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#010608'); g.addColorStop(0.6, '#020a0c'); g.addColorStop(1, '#030c0e')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Floating geometric shapes - some structure remains
      ctx.strokeStyle = '#10806020'; ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        const x = (i * 50 + 20) % w; const y = (i * 30 + 20) % (h * 0.5)
        const s = 20 + i * 8
        ctx.strokeRect(x, y, s, s)
      }
      // Thin light lines in distance
      ctx.strokeStyle = '#20c0a012'; ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        const y = h * (0.3 + i * 0.15)
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      // Void depth gradient
      const vg = ctx.createLinearGradient(0, 0, 0, h)
      vg.addColorStop(0, 'transparent'); vg.addColorStop(1, '#010608')
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h)
    },
    particles: [
      { color: '#20c0a020', size: 1, count: 5, speedY: -0.3, speedX: 0.05, life: 4000 },
      { color: '#10806015', size: 1, count: 3, speedY: -0.1, speedX: 0, life: 6000 },
    ],
    enemyPool: ['void-wisp', 'null-shard', 'the-forgotten'],
    elitePool: ['echo-fragment', 'silence'],
    miniboss: 'void-herald',
    boss: 'vestige',
    stages: 20,
    storyText: ["There is no floor. There is no ceiling. There is only down.", "Keep going."],
  },

  // ── ZONE 16: VOID DESCENT II ──────────────────────────────────────────────
  {
    id: 16,
    name: "ZONE 17 — VOID DESCENT II",
    label: "VOID DESCENT II",
    palette: {
      bg: '#020608', panel: '#040a0c', panel2: '#060c0e',
      border: '#0c1820', borderHi: '#183040',
      accent: '#108060', accent2: '#086040',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#040a0c 0,#040a0c 16px,#060c0e 16px,#060c0e 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#010406'); g.addColorStop(0.5, '#020608'); g.addColorStop(1, '#03070a')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Almost nothing - faint geometry dissolving
      ctx.strokeStyle = '#08604010'; ctx.lineWidth = 1
      for (let i = 0; i < 3; i++) {
        const x = (i * 70 + 30) % w; const y = (i * 40 + 15) % (h * 0.4)
        const s = 15 + i * 6
        ctx.strokeRect(x, y, s, s)
        // Dissolving effect - dotted lines
        ctx.beginPath(); ctx.setLineDash([2, 4])
        ctx.moveTo(x + s, y); ctx.lineTo(x + s + 20, y + 10)
        ctx.stroke(); ctx.setLineDash([])
      }
    },
    particles: [
      { color: '#10806015', size: 1, count: 4, speedY: -0.2, speedX: 0.03, life: 5000 },
    ],
    enemyPool: ['null-shard', 'the-forgotten', 'echo-fragment'],
    elitePool: ['echo-fragment', 'silence'],
    miniboss: 'null-prime',
    boss: 'the-weight',
    stages: 20,
    storyText: ["This place has forgotten it existed.", "You have not forgotten. Not yet."],
  },

  // ── ZONE 17: VOID DESCENT III ─────────────────────────────────────────────
  {
    id: 17,
    name: "ZONE 18 — VOID DESCENT III",
    label: "VOID DESCENT III",
    palette: {
      bg: '#010406', panel: '#020608', panel2: '#03070a',
      border: '#081220', borderHi: '#102030',
      accent: '#084040', accent2: '#062828',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#020608 0,#020608 16px,#03070a 16px,#03070a 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#010304'); g.addColorStop(1, '#010406')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Single faint dissolving shape
      ctx.strokeStyle = '#06303008'; ctx.lineWidth = 1
      ctx.strokeRect(w * 0.35, h * 0.15, w * 0.3, h * 0.25)
    },
    particles: [
      { color: '#08404010', size: 1, count: 2, speedY: -0.15, speedX: 0, life: 7000 },
    ],
    enemyPool: ['the-forgotten', 'echo-fragment', 'silence'],
    elitePool: ['echo-fragment', 'silence'],
    miniboss: 'unraveller',
    boss: 'collapse',
    stages: 20,
    storyText: ["Geometry is a suggestion down here.", "It is not a very convincing one."],
  },

  // ── ZONE 18: DEEP VOID I ──────────────────────────────────────────────────
  {
    id: 18,
    name: "ZONE 19 — DEEP VOID",
    label: "DEEP VOID I",
    palette: {
      bg: '#030200', panel: '#060400', panel2: '#080500',
      border: '#180c00', borderHi: '#2c1800',
      accent: '#806010', accent2: '#604008',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#060400 0,#060400 16px,#080600 16px,#080600 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#020100'); g.addColorStop(1, '#030200')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Single light source - upper right
      const light = ctx.createRadialGradient(w * 0.8, h * 0.15, 0, w * 0.8, h * 0.15, w * 0.35)
      light.addColorStop(0, '#806010' + '14'); light.addColorStop(1, 'transparent')
      ctx.fillStyle = light; ctx.fillRect(0, 0, w, h)
      // Faint ancient symbols - triangles and circles
      ctx.strokeStyle = '#60400808'; ctx.lineWidth = 1
      const syms: [number, number][] = [[w*0.2,h*0.3],[w*0.6,h*0.2],[w*0.4,h*0.5]]
      for (const [sx,sy] of syms) {
        ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI*2); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(sx, sy-10); ctx.lineTo(sx+9, sy+5); ctx.lineTo(sx-9, sy+5); ctx.closePath(); ctx.stroke()
      }
    },
    particles: [
      { color: '#80601010', size: 1, count: 2, speedY: -0.1, speedX: 0, life: 8000 },
    ],
    enemyPool: ['ancient-remnant', 'first-thing', 'void-prime'],
    elitePool: ['the-nameless', 'origin-shard'],
    miniboss: 'deep-remnant',
    boss: 'origin',
    stages: 20,
    storyText: ["The darkness here has weight.", "Something in it predates Wolton. Predates Brisbane. Predates memory."],
  },

  // ── ZONE 19: DEEP VOID II ─────────────────────────────────────────────────
  {
    id: 19,
    name: "ZONE 20 — DEEP VOID II",
    label: "DEEP VOID II",
    palette: {
      bg: '#020100', panel: '#040200', panel2: '#060300',
      border: '#100800', borderHi: '#201000',
      accent: '#604008', accent2: '#402804',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#040200 0,#040200 16px,#060300 16px,#060300 32px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#020100'; ctx.fillRect(0, 0, w, h)
      // Ancient symbols only - more numerous
      ctx.strokeStyle = '#50300606'; ctx.lineWidth = 1
      for (let i = 0; i < 7; i++) {
        const sx = (i * 43 + 15) % w; const sy = (i * 31 + 20) % (h * 0.7)
        if (i % 2 === 0) {
          ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI*2); ctx.stroke()
        } else {
          ctx.beginPath(); ctx.moveTo(sx, sy-8); ctx.lineTo(sx+7, sy+4); ctx.lineTo(sx-7, sy+4); ctx.closePath(); ctx.stroke()
        }
      }
    },
    particles: [
      { color: '#50300608', size: 1, count: 2, speedY: -0.08, speedX: 0, life: 9000 },
    ],
    enemyPool: ['void-prime', 'the-nameless', 'origin-shard'],
    elitePool: ['the-nameless', 'origin-shard'],
    miniboss: 'void-sovereign',
    boss: 'silence-absolute',
    stages: 20,
    storyText: ["There is no light here.", "There never was."],
  },

  // ── ZONE 20: DEEP VOID III — THE FIRST SLIME ─────────────────────────────
  {
    id: 20,
    name: "ZONE 21 — DEEP VOID III",
    label: "DEEP VOID III",
    palette: {
      bg: '#010100', panel: '#020200', panel2: '#030300',
      border: '#080800', borderHi: '#101000',
      accent: '#40c040', accent2: '#20a020',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#020200 0,#020200 16px,#030300 16px,#030300 32px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#010100'; ctx.fillRect(0, 0, w, h)
      // Faint green pedestal light - callback to zone 1
      const gl = ctx.createRadialGradient(w * 0.5, h * 0.65, 0, w * 0.5, h * 0.65, w * 0.2)
      gl.addColorStop(0, '#20c02018'); gl.addColorStop(1, 'transparent')
      ctx.fillStyle = gl; ctx.fillRect(0, 0, w, h)
      // Simple pedestal shape
      ctx.fillStyle = '#101800'; ctx.fillRect(w * 0.4, h * 0.62, w * 0.2, h * 0.06)
    },
    particles: [
      { color: '#30c03020', size: 2, count: 3, speedY: -0.3, speedX: 0.05, life: 4000 },
    ],
    enemyPool: ['origin-shard', 'first-thing', 'the-nameless'],
    elitePool: ['the-nameless', 'origin-shard'],
    miniboss: 'the-penultimate',
    boss: 'the-first-slime',
    stages: 20,
    storyText: ["It was here before everything.", "It will be here after."],
  },

  // ── ZONE 21: THE REMNANT I ────────────────────────────────────────────────
  {
    id: 21,
    name: "ZONE 22 — THE REMNANT",
    label: "THE REMNANT I",
    palette: {
      bg: '#040408', panel: '#080810', panel2: '#0c0c16',
      border: '#181830', borderHi: '#282860',
      accent: '#4040c0', accent2: '#2828a0',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#080810 0,#080810 16px,#0c0c16 16px,#0c0c16 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#020206'); g.addColorStop(0.6, '#040408'); g.addColorStop(1, '#05050a')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // Fragments of earlier zones floating - basement corner
      ctx.fillStyle = '#0c1a0c'; ctx.fillRect(10, h*0.2, 50, 40)
      ctx.fillStyle = '#1a140a'; ctx.fillRect(w-60, h*0.3, 50, 30)
      // Void in between
      const rg = ctx.createRadialGradient(w*0.5, h*0.4, 0, w*0.5, h*0.4, w*0.3)
      rg.addColorStop(0, '#2020a015'); rg.addColorStop(1, 'transparent')
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h)
    },
    particles: [
      { color: '#3030c025', size: 2, count: 5, speedY: -0.3, speedX: 0.1, life: 3500 },
      { color: '#181870' + '15', size: 1, count: 3, speedY: -0.15, speedX: 0, life: 5000 },
    ],
    enemyPool: ['remnant-wisp', 'fractured-origin', 'null-sovereign'],
    elitePool: ['void-colossus', 'the-between'],
    miniboss: 'remnant-prime',
    boss: 'the-remnant-boss',
    stages: 20,
    storyText: ["Fragments of the journey float here.", "The dungeon is eating its own history."],
  },

  // ── ZONE 22: THE REMNANT II ───────────────────────────────────────────────
  {
    id: 22,
    name: "ZONE 23 — THE REMNANT II",
    label: "THE REMNANT II",
    palette: {
      bg: '#040208', panel: '#080410', panel2: '#0c0616',
      border: '#180830', borderHi: '#281060',
      accent: '#6020c0', accent2: '#4010a0',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#080410 0,#080410 16px,#0c0616 16px,#0c0616 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#020106'); g.addColorStop(0.5, '#040208'); g.addColorStop(1, '#05030a')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // More fragmented - pieces smaller, more scattered
      ctx.fillStyle = '#0c1608'; ctx.fillRect(20, h*0.25, 30, 20)
      ctx.fillStyle = '#141010'; ctx.fillRect(w*0.5, h*0.15, 35, 25)
      ctx.fillStyle = '#160e08'; ctx.fillRect(w-45, h*0.5, 35, 20)
      // More void
      const rg = ctx.createRadialGradient(w*0.5, h*0.45, 0, w*0.5, h*0.45, w*0.35)
      rg.addColorStop(0, '#4010a015'); rg.addColorStop(1, 'transparent')
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h)
    },
    particles: [
      { color: '#5018b025', size: 2, count: 6, speedY: -0.35, speedX: 0.12, life: 3000 },
    ],
    enemyPool: ['fractured-origin', 'null-sovereign', 'void-colossus'],
    elitePool: ['void-colossus', 'the-between'],
    miniboss: 'null-colossus',
    boss: 'the-null',
    stages: 20,
    storyText: ["The pieces don't fit together.", "They never did."],
  },

  // ── ZONE 23: THE REMNANT III ──────────────────────────────────────────────
  {
    id: 23,
    name: "ZONE 24 — THE REMNANT III",
    label: "THE REMNANT III",
    palette: {
      bg: '#020208', panel: '#04040e', panel2: '#060614',
      border: '#100830', borderHi: '#180c50',
      accent: '#200880', accent2: '#14056a',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#04040e 0,#04040e 16px,#060614 16px,#060614 32px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#020208'; ctx.fillRect(0, 0, w, h)
      // Barely visible fragments - just outlines
      ctx.strokeStyle = '#18086015'; ctx.lineWidth = 1
      ctx.strokeRect(15, h*0.3, 25, 15)
      ctx.strokeRect(w-40, h*0.2, 30, 18)
      ctx.strokeRect(w*0.4, h*0.5, 20, 12)
      // Deep indigo void
      const vg = ctx.createRadialGradient(w*0.5, h*0.5, 0, w*0.5, h*0.5, w*0.4)
      vg.addColorStop(0, '#10047010'); vg.addColorStop(1, 'transparent')
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h)
    },
    particles: [
      { color: '#18067020', size: 1, count: 4, speedY: -0.25, speedX: 0.08, life: 4500 },
    ],
    enemyPool: ['null-sovereign', 'void-colossus', 'the-between'],
    elitePool: ['void-colossus', 'the-between'],
    miniboss: 'final-guardian',
    boss: 'the-nothing',
    stages: 20,
    storyText: ["Nothing is left.", "You are still here."],
  },

  // ── ZONE 24: NULL SPACE I ─────────────────────────────────────────────────
  {
    id: 24,
    name: "ZONE 25 — NULL SPACE",
    label: "NULL SPACE I",
    palette: {
      bg: '#0e0e10', panel: '#141416', panel2: '#181818',
      border: '#303038', borderHi: '#505060',
      accent: '#e0e0ff', accent2: '#c0c0e0',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#141414 0,#141414 16px,#181818 16px,#181818 32px)',
    drawBg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#0c0c0e'); g.addColorStop(0.7, '#0e0e10'); g.addColorStop(1, '#101012')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // White elements on dark - feels inverted
      ctx.fillStyle = '#e0e0ff12'
      for (let y = 0; y < h * 0.6; y += 20) {
        ctx.fillRect(8, y, w - 16, 12)
      }
      // White geometric shapes
      ctx.strokeStyle = '#c0c0e020'; ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        const x = (i * 55 + 20) % w; const y = (i * 35 + 15) % (h * 0.5)
        ctx.strokeRect(x, y, 30, 20)
      }
    },
    particles: [
      { color: '#c0c0ff20', size: 1, count: 5, speedY: -0.3, speedX: 0.1, life: 3500 },
    ],
    enemyPool: ['space-remnant', 'void-titan', 'null-ancient'],
    elitePool: ['the-erased', 'space-sovereign'],
    miniboss: 'space-colossus',
    boss: 'null-prime-boss',
    stages: 20,
    storyText: ["Something about this place is wrong.", "It is too bright. Too clean. Too absent."],
  },

  // ── ZONE 25: NULL SPACE II ────────────────────────────────────────────────
  {
    id: 25,
    name: "ZONE 26 — NULL SPACE II",
    label: "NULL SPACE II",
    palette: {
      bg: '#080808', panel: '#0c0c0c', panel2: '#101010',
      border: '#282828', borderHi: '#404040',
      accent: '#c0c0e0', accent2: '#a0a0c0',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#0c0c0c 0,#0c0c0c 16px,#101010 16px,#101010 32px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, w, h)
      // Half white, half dark panels alternating
      ctx.fillStyle = '#e0e0ff0a'
      for (let x = 0; x < w; x += 40) {
        if (Math.floor(x / 40) % 2 === 0) {
          ctx.fillRect(x, 0, 38, h)
        }
      }
      // Thin separation lines
      ctx.strokeStyle = '#a0a0c018'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke()
    },
    particles: [
      { color: '#a0a0e018', size: 1, count: 4, speedY: -0.25, speedX: 0.08, life: 4000 },
    ],
    enemyPool: ['null-ancient', 'the-erased', 'space-sovereign'],
    elitePool: ['the-erased', 'space-sovereign'],
    miniboss: 'void-ancient',
    boss: 'the-vast',
    stages: 20,
    storyText: ["You can no longer tell what is real.", "You are not sure it matters."],
  },

  // ── ZONE 26: NULL SPACE III ───────────────────────────────────────────────
  {
    id: 26,
    name: "ZONE 27 — NULL SPACE III",
    label: "NULL SPACE III",
    palette: {
      bg: '#040404', panel: '#080808', panel2: '#0c0c0c',
      border: '#181818', borderHi: '#282828',
      accent: '#a0a0c0', accent2: '#808090',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#080808 0,#080808 16px,#0c0c0c 16px,#0c0c0c 32px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#040404'; ctx.fillRect(0, 0, w, h)
      // White shapes on dark - reversed from zone 24
      ctx.fillStyle = '#a0a0c010'
      for (let i = 0; i < 6; i++) {
        const x = (i * 40 + 15) % w; const y = (i * 28 + 10) % (h * 0.6)
        ctx.fillRect(x, y, 25, 18)
      }
      ctx.strokeStyle = '#80809015'; ctx.lineWidth = 1
      ctx.strokeRect(w * 0.25, h * 0.25, w * 0.5, h * 0.4)
    },
    particles: [
      { color: '#808090' + '15', size: 1, count: 3, speedY: -0.2, speedX: 0.05, life: 5000 },
    ],
    enemyPool: ['the-erased', 'space-sovereign', 'null-ancient'],
    elitePool: ['the-erased', 'space-sovereign'],
    miniboss: 'space-prime',
    boss: 'the-infinite',
    stages: 20,
    storyText: ["Infinity is not a place.", "You are in it anyway."],
  },

  // ── ZONE 27: THE END I ────────────────────────────────────────────────────
  {
    id: 27,
    name: "ZONE 28 — THE END",
    label: "THE END I",
    palette: {
      bg: '#020202', panel: '#040404', panel2: '#060606',
      border: '#101010', borderHi: '#202020',
      accent: '#808080', accent2: '#606060',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#040404 0,#040404 16px,#060606 16px,#060606 32px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#020202'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#606060'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke()
    },
    particles: [
      { color: '#50505010', size: 1, count: 2, speedY: -0.1, speedX: 0, life: 6000 },
    ],
    enemyPool: ['end-remnant', 'final-wisp', 'end-sovereign'],
    elitePool: ['the-last', 'end-ancient'],
    miniboss: 'end-colossus',
    boss: 'the-first',
    stages: 20,
    storyText: ["A line.", "That's all."],
  },

  // ── ZONE 28: THE END II — TRUE FINAL ─────────────────────────────────────
  {
    id: 28,
    name: "ZONE 29 — THE END",
    label: "THE END",
    palette: {
      bg: '#000000', panel: '#010101', panel2: '#020202',
      border: '#080808', borderHi: '#141414',
      accent: '#404040', accent2: '#282828',
    },
    groundPattern: 'repeating-linear-gradient(90deg,#010101 0,#010101 16px,#020202 16px,#020202 32px)',
    drawBg(ctx, w, h) {
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h)
    },
    particles: [],
    enemyPool: ['final-wisp', 'end-sovereign', 'the-last'],
    elitePool: ['the-last', 'end-ancient'],
    miniboss: 'the-last-guardian',
    boss: 'the-end',
    stages: 20,
    storyText: [".", ""],
  },
]

// ── SECRET ZONE: ELLA'S WORLD (index 50, unlocks after 10 Hayden kills) ──
// Kept as a separate export — never appended to ZONES[]. Renderer picks this
// up via `player.currentZone === ELLA_ZONE_INDEX ? ELLA_ZONE : ZONES[idx]`.
export const ELLA_ZONE: Zone = {
  id: 50,
  name: "ELLA'S WORLD",
  label: "ELLA'S WORLD",
  palette: {
    bg: '#fff0f5', panel: '#ffe0ec', panel2: '#ffd0e0',
    border: '#ffb0cc', borderHi: '#ff80b0',
    accent: '#ff5090', accent2: '#ffa0c0',
  },
  groundPattern: 'repeating-linear-gradient(90deg,#ffd8e8 0,#ffd8e8 16px,#ffc8dc 16px,#ffc8dc 32px)',
  drawBg(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#fff0f5')
    g.addColorStop(0.6, '#ffe0ec')
    g.addColorStop(1, '#ffd0e0')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    const t = Date.now() / 1000
    for (let i = 0; i < 12; i++) {
      const cx = ((i * 73 + t * 8) % (w + 40)) - 20
      const cy = 20 + ((i * 41) % (h - 60)) + Math.sin(t + i) * 6
      const r = 6 + (i % 3) * 3
      ctx.fillStyle = i % 2 === 0 ? '#ffffffaa' : '#ffc0d8aa'
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#ff80b088'
    for (let i = 0; i < 6; i++) {
      const px = 40 + i * (w - 80) / 5
      const py = h - 30 + Math.sin(t * 2 + i) * 3
      ctx.beginPath()
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2
        ctx.ellipse(px + Math.cos(a) * 4, py + Math.sin(a) * 4, 3, 2, a, 0, Math.PI * 2)
      }
      ctx.fill()
    }
  },
  particles: [
    { color: '#ffffff', size: 2, count: 4, speedY: -0.2, speedX: 0.1, life: 5000 },
    { color: '#ffc0d8', size: 2, count: 3, speedY: -0.3, speedX: -0.05, life: 4500 },
  ],
  enemyPool: ['small-thing', 'crying-one'],
  elitePool: ['hachiware', 'usagi'],
  miniboss: 'chiikawa-itself',
  boss: 'ella',
  stages: 20,
  storyText: [
    "you shouldn't be here.",
    "she was kind. she was soft.",
    "you left anyway.",
    "hauu...",
  ],
}
