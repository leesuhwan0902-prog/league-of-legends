// 3D 위에 얹는 2D 오버레이 (체력바, 이름, 이펙트, 데미지 텍스트, 미니맵)
import { WORLD, BASES, COLORS } from './constants.js'

const TAU = Math.PI * 2

const ELEV = { minion: 42, champion: 84, tower: 118, nexus: 104 }

export function drawOverlay(ctx, view, game, scene) {
  drawGroundEffects(ctx, view, game, scene)
  drawRangeRing(ctx, view, game, scene)
  drawMoveTarget(ctx, view, game, scene)
  drawUnits(ctx, view, game, scene)
  drawFloaters(ctx, view, game, scene)
  drawMinimap(ctx, view, game, scene)
}

// ── 지면 이펙트 ──────────────────────────────────────────────

function groundCircle(ctx, scene, view, cx, cy, r) {
  const N = 26
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU
    const s = scene.project(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0, view)
    if (i === 0) ctx.moveTo(s.x, s.y)
    else ctx.lineTo(s.x, s.y)
  }
}

function drawGroundEffects(ctx, view, game, scene) {
  for (const e of game.effects) {
    const k = Math.max(0, Math.min(1, e.life / e.max))
    if (e.type === 'ring') {
      const r = e.r0 + (e.r1 - e.r0) * (1 - k)
      ctx.save()
      ctx.globalAlpha = k * 0.9
      ctx.beginPath()
      groundCircle(ctx, scene, view, e.x, e.y, r)
      if (e.fill) {
        ctx.closePath()
        ctx.fillStyle = `${e.color}2e`
        ctx.fill()
      }
      ctx.strokeStyle = e.color
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.restore()
    } else if (e.type === 'line') {
      const a = scene.project(e.x1, e.y1, e.z || 30, view)
      const ax = a.x
      const ay = a.y
      const b = scene.project(e.x2, e.y2, e.z2 || 30, view)
      ctx.save()
      ctx.globalAlpha = k
      ctx.strokeStyle = e.color
      ctx.lineWidth = e.width || 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.restore()
    } else if (e.type === 'spark') {
      const p = scene.project(e.x, e.y, e.z || 20, view)
      if (!p.visible) continue
      ctx.save()
      ctx.globalAlpha = k
      ctx.fillStyle = e.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }
}

function drawRangeRing(ctx, view, game, scene) {
  const p = game.player
  if (!p.alive) return
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.strokeStyle = COLORS.blue.base
  ctx.lineWidth = 1.5
  ctx.beginPath()
  groundCircle(ctx, scene, view, p.x, p.y, p.atkRange)
  ctx.stroke()
  ctx.restore()
}

function drawMoveTarget(ctx, view, game, scene) {
  const t = game.player && game.player.moveTarget
  if (!t) return
  const p = scene.project(t.x, t.y, 2, view)
  if (!p.visible) return
  ctx.save()
  ctx.strokeStyle = '#8ef0b0'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(p.x, p.y, 9, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(p.x - 14, p.y)
  ctx.lineTo(p.x + 14, p.y)
  ctx.moveTo(p.x, p.y - 14)
  ctx.lineTo(p.x, p.y + 14)
  ctx.globalAlpha = 0.6
  ctx.stroke()
  ctx.restore()
}

// ── 유닛 UI ──────────────────────────────────────────────────

function bar(ctx, cx, top, width, height, ratio, color) {
  const x = cx - width / 2
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(x - 1.5, top - 1.5, width + 3, height + 3)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(x, top, width, height)
  ctx.fillStyle = color
  ctx.fillRect(x, top, width * Math.max(0, Math.min(1, ratio)), height)
}

function drawUnits(ctx, view, game, scene) {
  ctx.textAlign = 'center'

  for (const u of game.units) {
    if (!u.alive) continue
    const elev = ELEV[u.kind] || 40
    const p = scene.project(u.x, u.y, elev, view)
    if (!p.visible) continue
    const px = p.x
    const py = p.y

    if (u.kind === 'champion') {
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      const label = `${u.name}  Lv.${u.level}`
      ctx.strokeText(label, px, py - 16)
      ctx.fillStyle = u.isPlayer ? '#eaf6ff' : '#ffd6d6'
      ctx.fillText(label, px, py - 16)
      bar(ctx, px, py - 10, 78, 8, u.hp / u.maxHp, u.isPlayer ? '#39d353' : '#ff5a5a')
      bar(ctx, px, py + 1, 78, 5, u.mana / u.maxMana, '#4aa8ff')
    } else if (u.kind === 'tower' || u.kind === 'nexus') {
      const w = u.kind === 'nexus' ? 96 : 64
      bar(ctx, px, py, w, 6, u.hp / u.maxHp, u.kind === 'nexus' ? '#ffd166' : COLORS[u.team].base)
    } else if (u.hp < u.maxHp) {
      bar(ctx, px, py, 34, 4, u.hp / u.maxHp, COLORS[u.team].base)
    }
  }
}

function drawFloaters(ctx, view, game, scene) {
  ctx.textAlign = 'center'
  for (const f of game.floaters) {
    const p = scene.project(f.x, f.y, f.gold ? 30 : 60, view)
    if (!p.visible) continue
    const k = Math.max(0, Math.min(1, f.life / f.max))
    ctx.save()
    ctx.globalAlpha = f.fixed ? Math.min(1, k * 2) : k
    ctx.font = `bold ${f.size || 13}px system-ui, sans-serif`
    ctx.lineWidth = 3.5
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.strokeText(f.text, p.x, p.y)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, p.x, p.y)
    ctx.restore()
  }
}

// ── 미니맵 ───────────────────────────────────────────────────

function drawMinimap(ctx, view, game, scene) {
  const size = Math.min(190, Math.max(120, Math.round(view.h * 0.28)))
  const pad = 16
  const x0 = view.w - size - pad
  const y0 = view.h - size - pad

  ctx.save()
  ctx.globalAlpha = 0.94
  ctx.fillStyle = 'rgba(4,8,14,0.88)'
  ctx.fillRect(x0, y0, size, size)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1)

  const sx = size / WORLD.w
  const sy = size / WORLD.h

  ctx.strokeStyle = 'rgba(150,180,155,0.5)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0 + BASES.blue.x * sx, y0 + BASES.blue.y * sy)
  ctx.lineTo(x0 + BASES.red.x * sx, y0 + BASES.red.y * sy)
  ctx.stroke()

  const bounds = scene.viewBounds(view)
  if (bounds) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(x0 + bounds.x * sx, y0 + bounds.y * sy, bounds.w * sx, bounds.h * sy)
  }

  for (const u of game.units) {
    if (!u.alive) continue
    const r = u.kind === 'champion' ? 3.8 : u.kind === 'nexus' ? 4.5 : u.kind === 'tower' ? 2.8 : 1.9
    ctx.fillStyle = COLORS[u.team].base
    ctx.beginPath()
    ctx.arc(x0 + u.x * sx, y0 + u.y * sy, r, 0, TAU)
    ctx.fill()
  }

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(x0 + game.player.x * sx, y0 + game.player.y * sy, 5.5, 0, TAU)
  ctx.stroke()
  ctx.restore()
}
