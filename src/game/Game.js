// 탑다운 미니 MOBA 게임 엔진 (렌더링 + 시뮬레이션 + AI)
import {
  WORLD, BASES, COLORS, ABILITIES, ABILITY_ORDER, TOWER_POSITIONS,
  clamp, lanePoint, distToLane, mulberry32,
  WAVE_INTERVAL, FIRST_WAVE_DELAY, XP_REWARD,
} from './constants.js'
import { createChampion, createMinion, createStructure } from './factory.js'

const dist2 = (a, b) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const TAU = Math.PI * 2

export class Game {
  constructor() {
    this.view = { w: 900, h: 600 }
    this.reset()
  }

  reset() {
    this.time = 0
    this.winner = null
    this.units = []
    this.projectiles = []
    this.effects = []
    this.floaters = []
    this.waveTimer = FIRST_WAVE_DELAY
    this.waveCount = 0
    this.champKills = { blue: 0, red: 0 }
    this.playerKills = 0
    this.playerCS = 0
    this.towersDestroyed = 0
    this.camera = { x: 0, y: 0 }

    this.player = createChampion('blue', BASES.blue, true)
    this.enemy = createChampion('red', BASES.red, false)
    this.enemy.name = '적 챔피언'
    // 적 챔피언은 소폭 강화 (난이도)
    this.enemy.maxHp += 120
    this.enemy.hp = this.enemy.maxHp
    this.enemy.atk += 4

    this.units.push(this.player, this.enemy)
    for (const tp of TOWER_POSITIONS) {
      this.units.push(createStructure('tower', tp.team, lanePoint(tp.t, tp.offset)))
    }
    this.units.push(createStructure('nexus', 'blue', BASES.blue))
    this.units.push(createStructure('nexus', 'red', BASES.red))

    this.decor = []
    const rnd = mulberry32(20241014)
    for (let i = 0; i < 140; i++) {
      const x = 40 + rnd() * (WORLD.w - 80)
      const y = 40 + rnd() * (WORLD.h - 80)
      if (distToLane(x, y) < 195) continue
      this.decor.push({ x, y, r: 16 + rnd() * 32, rock: rnd() > 0.62 })
    }
    this.camera.x = clamp(this.player.x - this.view.w / 2, 0, Math.max(0, WORLD.w - this.view.w))
    this.camera.y = clamp(this.player.y - this.view.h / 2, 0, Math.max(0, WORLD.h - this.view.h))
  }

  // ─────────────────────────── 입력 API ───────────────────────────

  setMoveTarget(wx, wy) {
    const p = this.player
    if (!p || !p.alive) return
    if (wx == null || wy == null) {
      p.moveTarget = null
      return
    }
    p.moveTarget = { x: clamp(wx, 20, WORLD.w - 20), y: clamp(wy, 20, WORLD.h - 20) }
  }

  castAbility(slot, wx, wy) {
    const ab = ABILITIES[slot]
    const p = this.player
    if (!ab) return { ok: false, reason: 'none' }
    if (this.winner) return { ok: false, reason: 'over' }
    if (!p.alive) return { ok: false, reason: 'dead' }
    if ((p.cooldowns[slot] || 0) > 0) return { ok: false, reason: 'cooldown' }
    if (p.mana < ab.mana) return { ok: false, reason: 'mana' }

    p.mana -= ab.mana
    p.cooldowns[slot] = ab.cd
    p.facing = Math.atan2(wy - p.y, wx - p.x)

    const scale = 1 + (p.level - 1) * 0.075
    if (ab.type === 'skillshot') this.spawnSkillshot(p, wx, wy, ab, scale)
    else if (ab.type === 'nova') this.castNova(p, ab, scale)
    else if (ab.type === 'dash') this.castDash(p, wx, wy, ab)
    else if (ab.type === 'ground') this.castGround(p, wx, wy, ab, scale)
    return { ok: true }
  }

  // ─────────────────────────── 스킬 구현 ───────────────────────────

  spawnSkillshot(owner, tx, ty, ab, scale) {
    const dx = tx - owner.x
    const dy = ty - owner.y
    const d = Math.hypot(dx, dy) || 1
    this.projectiles.push({
      x: owner.x,
      y: owner.y,
      vx: (dx / d) * ab.speed,
      vy: (dy / d) * ab.speed,
      radius: ab.radius,
      team: owner.team,
      damage: ab.damage * scale,
      color: ab.color,
      life: ab.range / ab.speed,
      owner,
      dead: false,
    })
  }

  castNova(owner, ab, scale) {
    this.effects.push({ type: 'ring', x: owner.x, y: owner.y, r0: 12, r1: ab.radius, life: 0.38, max: 0.38, color: ab.color, fill: true })
    for (const u of this.units) {
      if (!u.alive || u.team === owner.team) continue
      if (dist(owner, u) <= ab.radius + u.radius) this.dealDamage(u, ab.damage * scale, owner)
    }
  }

  castDash(owner, wx, wy, ab) {
    const dx = wx - owner.x
    const dy = wy - owner.y
    const d = Math.hypot(dx, dy) || 1
    const step = Math.min(ab.distance, d)
    const nx = clamp(owner.x + (dx / d) * step, 24, WORLD.w - 24)
    const ny = clamp(owner.y + (dy / d) * step, 24, WORLD.h - 24)
    this.effects.push({ type: 'line', x1: owner.x, y1: owner.y, x2: nx, y2: ny, life: 0.3, max: 0.3, color: ab.color, width: 12 })
    owner.x = nx
    owner.y = ny
    owner.moveTarget = null
  }

  castGround(owner, wx, wy, ab, scale) {
    const dx = wx - owner.x
    const dy = wy - owner.y
    const d = Math.hypot(dx, dy) || 1
    const step = Math.min(ab.range, d)
    const tx = clamp(owner.x + (dx / d) * step, 20, WORLD.w - 20)
    const ty = clamp(owner.y + (dy / d) * step, 20, WORLD.h - 20)
    this.effects.push({ type: 'ring', x: tx, y: ty, r0: 24, r1: ab.radius, life: 0.55, max: 0.55, color: ab.color, fill: true })
    for (const u of this.units) {
      if (!u.alive || u.team === owner.team) continue
      if (Math.hypot(u.x - tx, u.y - ty) <= ab.radius + u.radius) this.dealDamage(u, ab.damage * scale, owner)
    }
  }

  // ─────────────────────────── 전투 ───────────────────────────

  dealDamage(target, amount, source) {
    if (!target || !target.alive) return
    const rounded = Math.max(1, Math.round(amount))
    target.hp -= rounded
    target.hitFlash = 0.14
    target.lastHitBy = source || null
    this.floaters.push({
      x: target.x + (Math.random() - 0.5) * 16,
      y: target.y - target.radius - 8,
      text: String(rounded),
      life: 0.75,
      max: 0.75,
      color: source && source.team === 'blue' ? '#9be7ff' : '#ffb3b3',
      size: 13,
    })
    if (target.hp <= 0) this.killUnit(target, source)
  }

  killUnit(u, source) {
    if (!u.alive) return
    u.alive = false
    u.hp = 0
    const c = COLORS[u.team]
    this.effects.push({ type: 'ring', x: u.x, y: u.y, r0: u.radius, r1: u.radius * 3.6, life: 0.42, max: 0.42, color: c.base })
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU
      this.effects.push({ type: 'spark', x: u.x, y: u.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.4, max: 0.4, color: c.light })
    }

    const byBlue = source && source.team === 'blue'
    if (u.kind === 'minion') {
      if (source === this.player) this.playerCS++
      if (byBlue) this.gainXp(XP_REWARD.minion)
    } else if (u.kind === 'tower') {
      if (byBlue) {
        this.towersDestroyed++
        this.gainXp(XP_REWARD.tower)
        this.announce(u.team === 'red' ? '적 타워 파괴!' : '아군 타워 파괴됨', u.team === 'red' ? '#7dd3fc' : '#ff8a8a')
      }
    } else if (u.kind === 'champion') {
      if (u.team === 'red') {
        this.champKills.blue++
        this.playerKills++
        this.gainXp(XP_REWARD.champion)
        this.announce('적 챔피언 처치!', '#ffd166')
      } else {
        this.champKills.red++
        this.announce('챔피언 사망', '#ff8a8a')
      }
      u.respawnTimer = u.team === 'blue' ? 7 : 9
      u.moveTarget = null
    } else if (u.kind === 'nexus') {
      this.winner = u.team === 'red' ? 'blue' : 'red'
      this.announce(this.winner === 'blue' ? 'VICTORY' : 'DEFEAT', this.winner === 'blue' ? '#ffd166' : '#ff6b6b')
    }
  }

  announce(text, color) {
    this.floaters.push({ x: this.player.x, y: this.player.y - 70, text, life: 1.8, max: 1.8, color, size: 20, fixed: true })
  }

  gainXp(amount) {
    const p = this.player
    if (!p) return
    if (p.level >= 18) return
    p.xp += amount
    while (p.level < 18 && p.xp >= p.xpNext) {
      p.xp -= p.xpNext
      p.level++
      p.xpNext = Math.round(p.xpNext * 1.28)
      p.maxHp += 95
      p.hp = Math.min(p.maxHp, p.hp + 95)
      p.maxMana += 32
      p.mana = Math.min(p.maxMana, p.mana + 32)
      p.atk += 4
      p.atkSpeed = Math.min(2.2, p.atkSpeed + 0.02)
      this.effects.push({ type: 'ring', x: p.x, y: p.y, r0: 22, r1: 110, life: 0.6, max: 0.6, color: '#ffd166' })
      this.announce(`레벨 ${p.level}!`, '#ffd166')
    }
  }

  // ─────────────────────────── 시뮬레이션 ───────────────────────────

  update(dt) {
    this.time += dt

    // 웨이브 스폰
    this.waveTimer -= dt
    if (this.waveTimer <= 0) {
      this.waveTimer = WAVE_INTERVAL
      this.waveCount++
      this.spawnWave('blue')
      this.spawnWave('red')
    }

    for (const u of this.units) this.updateUnit(u, dt)

    this.updateProjectiles(dt)
    this.separate()
    this.updateEffects(dt)
    this.updateCamera()
    this.reap()

    if (!this.winner) this.checkWin()
  }

  spawnWave(team) {
    const scale = 1 + Math.min(this.time, 900) / 900 * 0.85
    const count = 4
    for (let i = 0; i < count; i++) {
      const ranged = i === count - 1
      const t = team === 'blue' ? 0.022 + i * 0.007 : 0.978 - i * 0.007
      const p = lanePoint(t, (i - (count - 1) / 2) * 34)
      this.units.push(createMinion(team, p, ranged, scale))
    }
  }

  updateUnit(u, dt) {
    if (!u.alive) {
      if (u.kind === 'champion') {
        u.respawnTimer -= dt
        if (u.respawnTimer <= 0) this.respawn(u)
        else if (u.lastHitBy && u.hitFlash > 0) u.hitFlash -= dt
      }
      return
    }
    if (u.hitFlash > 0) u.hitFlash -= dt
    if (u.attackCd > 0) u.attackCd -= dt

    if (u.kind === 'tower') this.updateTower(u)
    else if (u.kind === 'nexus') this.updateNexus()
    else if (u.kind === 'minion') this.updateMinion(u, dt)
    else if (u.kind === 'champion') this.updateChampion(u, dt)
  }

  respawn(u) {
    const base = BASES[u.team]
    u.x = base.x
    u.y = base.y
    u.alive = true
    u.hp = u.maxHp
    u.mana = u.maxMana
    u.respawnTimer = 0
    u.attackCd = 0
    this.effects.push({ type: 'ring', x: u.x, y: u.y, r0: 12, r1: 120, life: 0.6, max: 0.6, color: '#ffffff' })
  }

  /** 아군 우선순위: 미니언/챔피언 → 구조물 */
  pickTarget(unit, range) {
    const r2 = range * range
    let bestSoft = null, bdSoft = Infinity
    let bestHard = null, bdHard = Infinity
    for (const u of this.units) {
      if (u === unit || !u.alive || u.team === unit.team) continue
      const d2 = dist2(unit, u)
      if (d2 > r2) continue
      if (u.kind === 'tower' || u.kind === 'nexus') {
        if (d2 < bdHard) { bdHard = d2; bestHard = u }
      } else if (d2 < bdSoft) {
        bdSoft = d2
        bestSoft = u
      }
    }
    if (unit.kind === 'tower') return bestSoft || null
    return bestSoft || bestHard
  }

  basicAttack(attacker, target) {
    this.dealDamage(target, attacker.atk, attacker)
    attacker.attackCd = 1 / attacker.atkSpeed
    attacker.facing = Math.atan2(target.y - attacker.y, target.x - attacker.x)
    const isTower = attacker.kind === 'tower'
    this.effects.push({
      type: 'line',
      x1: attacker.x,
      y1: attacker.y,
      x2: target.x,
      y2: target.y,
      life: isTower ? 0.16 : 0.12,
      max: isTower ? 0.16 : 0.12,
      color: isTower ? '#ffd98a' : COLORS[attacker.team].light,
      width: isTower ? 4 : 2,
    })
  }

  approach(unit, tx, ty, dt, stopDist) {
    const dx = tx - unit.x
    const dy = ty - unit.y
    const d = Math.hypot(dx, dy)
    if (d < 0.001) return 0
    const want = d - stopDist
    if (want <= 0.5) return 0
    const step = Math.min(unit.speed * dt, want)
    unit.x += (dx / d) * step
    unit.y += (dy / d) * step
    unit.facing = Math.atan2(dy, dx)
    unit.x = clamp(unit.x, 20, WORLD.w - 20)
    unit.y = clamp(unit.y, 20, WORLD.h - 20)
    return step
  }

  updateNexus() { /* 넥서스는 공격하지 않음 */ }

  updateTower(u) {
    const target = this.pickTarget(u, u.aggroRange)
    if (target && u.attackCd <= 0) this.basicAttack(u, target)
  }

  updateMinion(u, dt) {
    const target = this.pickTarget(u, u.aggroRange)
    if (target) {
      const d = dist(u, target)
      if (d > u.atkRange * 0.92) this.approach(u, target.x, target.y, dt, u.atkRange * 0.82)
      else if (u.attackCd <= 0) this.basicAttack(u, target)
    } else {
      const goal = u.team === 'blue' ? BASES.red : BASES.blue
      this.approach(u, goal.x, goal.y, dt, 40)
    }
  }

  updateChampion(u, dt) {
    u.mana = Math.min(u.maxMana, u.mana + u.manaRegen * dt)
    for (const k of ABILITY_ORDER) if (u.cooldowns[k] > 0) u.cooldowns[k] = Math.max(0, u.cooldowns[k] - dt)
    if (u.isPlayer) this.updatePlayerChampion(u, dt)
    else this.updateEnemyChampion(u, dt)
  }

  updatePlayerChampion(u, dt) {
    if (u.moveTarget) {
      const d = dist(u, u.moveTarget)
      if (d < 8) u.moveTarget = null
      else this.approach(u, u.moveTarget.x, u.moveTarget.y, dt, 0)
    }
    const target = this.pickTarget(u, u.atkRange)
    if (target && u.attackCd <= 0) this.basicAttack(u, target)
  }

  updateEnemyChampion(u, dt) {
    const p = this.player
    // 위험 시 후퇴
    if (u.hp / u.maxHp < 0.3) {
      this.approach(u, BASES.red.x, BASES.red.y, dt, 70)
      return
    }

    const dPlayer = p.alive ? dist(u, p) : Infinity

    // 스킬 사용
    if (p.alive && dPlayer < 500 && u.cooldowns.Q <= 0 && u.mana >= ABILITIES.Q.mana) {
      this.spawnSkillshot(u, p.x, p.y, ABILITIES.Q, 1)
      u.mana -= ABILITIES.Q.mana
      u.cooldowns.Q = ABILITIES.Q.cd
    }
    if (p.alive && dPlayer < 165 && u.cooldowns.W <= 0 && u.mana >= ABILITIES.W.mana) {
      this.castNova(u, ABILITIES.W, 1)
      u.mana -= ABILITIES.W.mana
      u.cooldowns.W = ABILITIES.W.cd
    }
    if (p.alive && dPlayer < 470 && u.cooldowns.R <= 0 && u.mana >= ABILITIES.R.mana) {
      this.castGround(u, p.x, p.y, ABILITIES.R, 1)
      u.mana -= ABILITIES.R.mana
      u.cooldowns.R = ABILITIES.R.cd
    }

    // 타겟 선정 (플레이어 우선)
    let target = null
    let best = Infinity
    for (const other of this.units) {
      if (!other.alive || other.team === u.team) continue
      if (other.kind === 'nexus') continue
      const d = dist(u, other)
      const weight = other.kind === 'champion' ? d * 0.65 : other.kind === 'tower' ? d * 1.4 : d
      if (weight < best) { best = weight; target = other }
    }

    if (target) {
      const d = dist(u, target)
      if (d > u.atkRange * 0.9) this.approach(u, target.x, target.y, dt, u.atkRange * 0.82)
      else if (u.attackCd <= 0) this.basicAttack(u, target)
    } else {
      this.approach(u, BASES.blue.x, BASES.blue.y, dt, 60)
    }
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt
      pr.y += pr.vy * dt
      pr.life -= dt
      if (pr.life <= 0) { pr.dead = true; continue }
      if (pr.x < 0 || pr.y < 0 || pr.x > WORLD.w || pr.y > WORLD.h) { pr.dead = true; continue }
      for (const u of this.units) {
        if (!u.alive || u.team === pr.team) continue
        if (dist(pr, u) <= pr.radius + u.radius) {
          this.dealDamage(u, pr.damage, pr.owner)
          this.effects.push({ type: 'ring', x: pr.x, y: pr.y, r0: pr.radius, r1: pr.radius * 3, life: 0.25, max: 0.25, color: pr.color })
          pr.dead = true
          break
        }
      }
    }
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead)
  }

  separate() {
    const movable = this.units.filter((u) => u.alive && (u.kind === 'minion' || u.kind === 'champion'))
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) {
        const a = movable[i]
        const b = movable[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy)
        const min = a.radius + b.radius
        if (d > 0 && d < min) {
          const push = (min - d) / 2
          const nx = dx / d
          const ny = dy / d
          a.x -= nx * push
          a.y -= ny * push
          b.x += nx * push
          b.y += ny * push
        }
      }
    }
  }

  updateEffects(dt) {
    for (const e of this.effects) {
      e.life -= dt
      if (e.type === 'spark') {
        e.x += e.vx * dt
        e.y += e.vy * dt
        e.vx *= 0.92
        e.vy *= 0.92
      }
    }
    this.effects = this.effects.filter((e) => e.life > 0)
    for (const f of this.floaters) {
      f.life -= dt
      if (!f.fixed) f.y -= 34 * dt
    }
    this.floaters = this.floaters.filter((f) => f.life > 0)
  }

  updateCamera() {
    const p = this.player
    const v = this.view
    const tx = p.x - v.w / 2
    const ty = p.y - v.h / 2
    this.camera.x += (tx - this.camera.x) * 0.16
    this.camera.y += (ty - this.camera.y) * 0.16
    const maxX = WORLD.w - v.w
    const maxY = WORLD.h - v.h
    this.camera.x = maxX <= 0 ? maxX / 2 : clamp(this.camera.x, 0, maxX)
    this.camera.y = maxY <= 0 ? maxY / 2 : clamp(this.camera.y, 0, maxY)
  }

  reap() {
    this.units = this.units.filter((u) => u.alive || u.kind === 'champion')
  }

  checkWin() {
    const blueNexus = this.units.find((u) => u.kind === 'nexus' && u.team === 'blue')
    const redNexus = this.units.find((u) => u.kind === 'nexus' && u.team === 'red')
    if (redNexus && !redNexus.alive) this.winner = 'blue'
    else if (blueNexus && !blueNexus.alive) this.winner = 'red'
  }

  // ─────────────────────────── 렌더링 ───────────────────────────

  render(ctx, view, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, view.w, view.h)
    ctx.fillStyle = '#04060c'
    ctx.fillRect(0, 0, view.w, view.h)

    ctx.save()
    ctx.translate(-this.camera.x, -this.camera.y)
    this.drawMap(ctx)
    this.drawUnits(ctx)
    this.drawProjectiles(ctx)
    this.drawEffects(ctx)
    this.drawFloaters(ctx)
    ctx.restore()

    this.drawMinimap(ctx, view)
    this.drawVignette(ctx, view)
  }

  drawMap(ctx) {
    ctx.fillStyle = '#0c1a14'
    ctx.fillRect(0, 0, WORLD.w, WORLD.h)

    // 장식 (수풀/바위)
    for (const d of this.decor) {
      if (d.rock) {
        ctx.fillStyle = '#232f28'
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#2f3d34'
        ctx.beginPath()
        ctx.arc(d.x - d.r * 0.15, d.y - d.r * 0.2, d.r * 0.62, 0, TAU)
        ctx.fill()
      } else {
        ctx.fillStyle = '#123a26'
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#0e2c1d'
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r * 0.6, 0, TAU)
        ctx.fill()
      }
    }

    // 레인
    const a = BASES.blue
    const b = BASES.red
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#31402f'
    ctx.lineWidth = 250
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.strokeStyle = '#3f5340'
    ctx.lineWidth = 190
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()

    // 강
    const mid = lanePoint(0.5)
    ctx.save()
    ctx.translate(mid.x, mid.y)
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x))
    ctx.fillStyle = 'rgba(46,124,170,0.30)'
    ctx.fillRect(-95, -1700, 190, 3400)
    ctx.fillStyle = 'rgba(120,200,240,0.10)'
    ctx.fillRect(-60, -1700, 40, 3400)
    ctx.restore()

    // 각 진영 기지 영역
    for (const team of ['blue', 'red']) {
      const base = BASES[team]
      const c = COLORS[team]
      const grd = ctx.createRadialGradient(base.x, base.y, 20, base.x, base.y, 330)
      grd.addColorStop(0, `${c.base}44`)
      grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(base.x, base.y, 330, 0, TAU)
      ctx.fill()
    }
  }

  drawUnits(ctx) {
    const order = { nexus: 0, tower: 1, minion: 2, champion: 3 }
    const list = this.units.filter((u) => u.alive).sort((x, y) => order[x.kind] - order[y.kind])
    for (const u of list) {
      if (u.kind === 'champion') this.drawChampion(ctx, u)
      else if (u.kind === 'minion') this.drawMinion(ctx, u)
      else this.drawStructure(ctx, u)
    }
  }

  drawStructure(ctx, u) {
    const c = COLORS[u.team]
    const isNexus = u.kind === 'nexus'
    const r = u.radius

    ctx.save()
    ctx.shadowColor = c.base
    ctx.shadowBlur = isNexus ? 34 : 16
    if (isNexus) {
      ctx.translate(u.x, u.y)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = c.dark
      ctx.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44)
      ctx.fillStyle = c.base
      ctx.fillRect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.84)
    } else {
      ctx.fillStyle = c.dark
      ctx.beginPath()
      ctx.arc(u.x, u.y, r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = c.base
      ctx.beginPath()
      ctx.arc(u.x, u.y, r * 0.62, 0, TAU)
      ctx.fill()
    }
    ctx.restore()

    if (u.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${u.hitFlash * 3})`
      ctx.beginPath()
      ctx.arc(u.x, u.y, r, 0, TAU)
      ctx.fill()
    }

    this.drawBar(ctx, u.x, u.y - r - 16, r * 2.4, u.hp / u.maxHp, isNexus ? '#ffd166' : c.base)
  }

  drawMinion(ctx, u) {
    const c = COLORS[u.team]
    ctx.fillStyle = c.minion
    ctx.beginPath()
    if (u.ranged) {
      ctx.save()
      ctx.translate(u.x, u.y)
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-u.radius, -u.radius, u.radius * 2, u.radius * 2)
      ctx.restore()
    } else {
      ctx.arc(u.x, u.y, u.radius, 0, TAU)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(u.x, u.y, u.radius, 0, TAU)
    ctx.stroke()
    if (u.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${u.hitFlash * 3})`
      ctx.beginPath()
      ctx.arc(u.x, u.y, u.radius, 0, TAU)
      ctx.fill()
    }
    if (u.hp < u.maxHp) this.drawBar(ctx, u.x, u.y - u.radius - 9, u.radius * 2.2, u.hp / u.maxHp, c.base, 3)
  }

  drawChampion(ctx, u) {
    const c = COLORS[u.team]
    const r = u.radius
    // 사거리 표시
    ctx.strokeStyle = `${c.base}22`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(u.x, u.y, u.atkRange, 0, TAU)
    ctx.stroke()

    ctx.save()
    ctx.shadowColor = c.base
    ctx.shadowBlur = 22
    ctx.fillStyle = c.dark
    ctx.beginPath()
    ctx.arc(u.x, u.y, r, 0, TAU)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = c.base
    ctx.beginPath()
    ctx.arc(u.x, u.y, r * 0.68, 0, TAU)
    ctx.fill()

    // 바라보는 방향 표시
    ctx.strokeStyle = c.light
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(u.x, u.y)
    ctx.lineTo(u.x + Math.cos(u.facing) * (r + 9), u.y + Math.sin(u.facing) * (r + 9))
    ctx.stroke()

    if (u.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${u.hitFlash * 3})`
      ctx.beginPath()
      ctx.arc(u.x, u.y, r, 0, TAU)
      ctx.fill()
    }

    // 이름 + 레벨
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = u.isPlayer ? '#ffffff' : '#ffd0d0'
    ctx.fillText(`${u.name} (Lv.${u.level})`, u.x, u.y - r - 26)

    this.drawBar(ctx, u.x, u.y - r - 20, 64, u.hp / u.maxHp, u.isPlayer ? '#39d353' : '#ff5a5a', 7)
    if (u.maxMana > 0) this.drawBar(ctx, u.x, u.y - r - 12, 64, u.mana / u.maxMana, '#4aa8ff', 5)
  }

  drawBar(ctx, cx, topY, width, ratio, color, height = 6) {
    const w = width
    const h = height
    const x = cx - w / 2
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.fillRect(x - 1, topY - 1, w + 2, h + 2)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(x, topY, w, h)
    const clamped = clamp(ratio, 0, 1)
    ctx.fillStyle = color
    ctx.fillRect(x, topY, w * clamped, h)
  }

  drawProjectiles(ctx) {
    for (const pr of this.projectiles) {
      ctx.save()
      ctx.shadowColor = pr.color
      ctx.shadowBlur = 18
      ctx.fillStyle = pr.color
      ctx.beginPath()
      ctx.arc(pr.x, pr.y, pr.radius, 0, TAU)
      ctx.fill()
      ctx.restore()
      const n = Math.hypot(pr.vx, pr.vy) || 1
      ctx.strokeStyle = `${pr.color}77`
      ctx.lineWidth = pr.radius * 1.4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(pr.x, pr.y)
      ctx.lineTo(pr.x - (pr.vx / n) * 34, pr.y - (pr.vy / n) * 34)
      ctx.stroke()
    }
  }

  drawEffects(ctx) {
    for (const e of this.effects) {
      const k = clamp(e.life / e.max, 0, 1)
      if (e.type === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * (1 - k)
        ctx.save()
        ctx.globalAlpha = k * 0.85
        if (e.fill) {
          ctx.fillStyle = `${e.color}33`
          ctx.beginPath()
          ctx.arc(e.x, e.y, r, 0, TAU)
          ctx.fill()
        }
        ctx.strokeStyle = e.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(e.x, e.y, r, 0, TAU)
        ctx.stroke()
        ctx.restore()
      } else if (e.type === 'line') {
        ctx.save()
        ctx.globalAlpha = k
        ctx.strokeStyle = e.color
        ctx.lineWidth = e.width || 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(e.x1, e.y1)
        ctx.lineTo(e.x2, e.y2)
        ctx.stroke()
        ctx.restore()
      } else if (e.type === 'spark') {
        ctx.save()
        ctx.globalAlpha = k
        ctx.fillStyle = e.color
        ctx.beginPath()
        ctx.arc(e.x, e.y, 3, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
    }
  }

  drawFloaters(ctx) {
    ctx.textAlign = 'center'
    for (const f of this.floaters) {
      const k = clamp(f.life / f.max, 0, 1)
      ctx.save()
      ctx.globalAlpha = f.fixed ? Math.min(1, k * 2) : k
      ctx.font = `bold ${f.size || 13}px system-ui, sans-serif`
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.strokeText(f.text, f.x, f.y)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.x, f.y)
      ctx.restore()
    }
  }

  drawMinimap(ctx, view) {
    const size = Math.min(180, Math.max(120, Math.round(view.h * 0.28)))
    const pad = 16
    const x0 = view.w - size - pad
    const y0 = view.h - size - pad
    ctx.save()
    ctx.globalAlpha = 0.94
    ctx.fillStyle = 'rgba(4,8,14,0.86)'
    ctx.fillRect(x0, y0, size, size)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1)

    const sx = size / WORLD.w
    const sy = size / WORLD.h
    ctx.strokeStyle = 'rgba(150,180,155,0.55)'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x0 + BASES.blue.x * sx, y0 + BASES.blue.y * sy)
    ctx.lineTo(x0 + BASES.red.x * sx, y0 + BASES.red.y * sy)
    ctx.stroke()

    for (const u of this.units) {
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
    ctx.arc(x0 + this.player.x * sx, y0 + this.player.y * sy, 5.5, 0, TAU)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(x0 + this.camera.x * sx, y0 + this.camera.y * sy, view.w * sx, view.h * sy)
    ctx.restore()
  }

  drawVignette(ctx, view) {
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.35, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75)
    g.addColorStop(0, 'transparent')
    g.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, view.w, view.h)
  }

  // ─────────────────────────── HUD 스냅샷 ───────────────────────────

  getHud() {
    const p = this.player
    const e = this.enemy
    return {
      time: this.time,
      winner: this.winner,
      wave: this.waveCount,
      champKills: this.champKills,
      player: {
        hp: Math.max(0, Math.round(p.hp)),
        maxHp: Math.round(p.maxHp),
        mana: Math.max(0, Math.round(p.mana)),
        maxMana: Math.round(p.maxMana),
        level: p.level,
        xp: p.xp,
        xpNext: p.xpNext,
        alive: p.alive,
        respawn: Math.max(0, p.respawnTimer),
        kills: this.playerKills,
        cs: this.playerCS,
        towers: this.towersDestroyed,
      },
      enemy: {
        hp: Math.max(0, Math.round(e.hp)),
        maxHp: Math.round(e.maxHp),
        alive: e.alive,
        level: e.level,
      },
      abilities: ABILITY_ORDER.map((k) => {
        const ab = ABILITIES[k]
        const cd = p.cooldowns[k] || 0
        return {
          key: k,
          name: ab.name,
          desc: ab.desc,
          mana: ab.mana,
          cd,
          cdMax: ab.cd,
          ratio: cd > 0 ? cd / ab.cd : 0,
          ready: p.alive && cd <= 0 && p.mana >= ab.mana,
          noMana: p.mana < ab.mana,
        }
      }),
    }
  }
}
