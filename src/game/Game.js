// 탑다운 미니 MOBA — 시뮬레이션 · AI · 전투 (렌더링은 Scene3D / overlay 담당)
import {
  WORLD, BASES, COLORS, ABILITIES, ABILITY_ORDER, TOWER_POSITIONS,
  clamp, lanePoint, distToLane, mulberry32,
  WAVE_INTERVAL, FIRST_WAVE_DELAY, XP_REWARD, GOLD, ITEMS_BY_ID, MAX_ITEMS,
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
    this.gold = GOLD.start
    this.goldEarned = 0
    this.lastBuy = null

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

    const scale = this.abilityScale(p)
    if (ab.type === 'skillshot') this.spawnSkillshot(p, wx, wy, ab, scale)
    else if (ab.type === 'nova') this.castNova(p, ab, scale)
    else if (ab.type === 'dash') this.castDash(p, wx, wy, ab)
    else if (ab.type === 'ground') this.castGround(p, wx, wy, ab, scale)
    return { ok: true }
  }

  /** 스킬 피해 배율 = 레벨 계수 × 주문력(ap) 계수 */
  abilityScale(unit) {
    return (1 + (unit.level - 1) * 0.075) * (1 + (unit.ap || 0))
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

  // ─────────────────────────── 골드 & 상점 ───────────────────────────

  addGold(amount, x, y) {
    const rounded = Math.round(amount)
    this.gold += rounded
    this.goldEarned += rounded
    this.floaters.push({
      x: x ?? this.player.x,
      y: y ?? this.player.y,
      text: `+${rounded}`,
      life: 1.1,
      max: 1.1,
      color: '#ffd166',
      size: 14,
      gold: true,
    })
    return rounded
  }

  /** 아이템 구매 */
  buyItem(itemId) {
    const item = ITEMS_BY_ID[itemId]
    const p = this.player
    if (!item) return { ok: false, reason: 'unknown' }
    if (p.items.length >= MAX_ITEMS) return { ok: false, reason: 'full' }
    if (this.gold < item.cost) return { ok: false, reason: 'gold' }
    if (!p.alive) return { ok: false, reason: 'dead' }

    this.gold -= item.cost
    p.items.push(itemId)
    this.applyItemStats(p, item)
    this.lastBuy = { id: itemId, at: this.time }
    this.floaters.push({ x: p.x, y: p.y, text: `${item.icon} ${item.name} 구매`, life: 1.6, max: 1.6, color: '#9be7ff', size: 14 })
    return { ok: true, item }
  }

  applyItemStats(unit, item) {
    const s = item.stats || {}
    if (s.atk) unit.atk += s.atk
    if (s.atkSpeed) unit.atkSpeed = Math.min(2.5, unit.atkSpeed + s.atkSpeed)
    if (s.speed) unit.speed += s.speed
    if (s.ap) unit.ap = (unit.ap || 0) + s.ap
    if (s.maxHp) {
      unit.maxHp += s.maxHp
      unit.hp = Math.min(unit.maxHp, unit.hp + s.maxHp)
    }
    if (s.maxMana) {
      unit.maxMana += s.maxMana
      unit.mana = Math.min(unit.maxMana, unit.mana + s.maxMana)
    }
  }

  /** 보유 아이템으로 얻은 능력치 합계 (HUD 표시용) */
  itemTotals() {
    const t = { atk: 0, atkSpeed: 0, speed: 0, ap: 0, maxHp: 0, maxMana: 0 }
    for (const id of this.player.items) {
      const s = ITEMS_BY_ID[id] && ITEMS_BY_ID[id].stats
      if (!s) continue
      for (const k of Object.keys(t)) if (s[k]) t[k] += s[k]
    }
    return t
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
      this.effects.push({ type: 'spark', x: u.x, y: u.y, z: u.radius, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.4, max: 0.4, color: c.light })
    }

    const byPlayer = source === this.player
    const byBlue = source && source.team === 'blue'

    if (u.kind === 'minion') {
      if (byPlayer) this.playerCS++
      if (byBlue) this.gainXp(XP_REWARD.minion)
      // ★ 미니언 처치 골드 (플레이어가 막타를 쳤을 때)
      if (byPlayer) this.addGold(u.ranged ? GOLD.minionRanged : GOLD.minionMelee, u.x, u.y)
    } else if (u.kind === 'tower') {
      if (byBlue) {
        this.towersDestroyed++
        this.gainXp(XP_REWARD.tower)
        this.addGold(GOLD.tower, u.x, u.y)
        this.announce(u.team === 'red' ? '적 타워 파괴! +180G' : '아군 타워 파괴됨', u.team === 'red' ? '#7dd3fc' : '#ff8a8a')
      }
    } else if (u.kind === 'champion') {
      if (u.team === 'red') {
        this.champKills.blue++
        this.playerKills++
        this.gainXp(XP_REWARD.champion)
        this.addGold(GOLD.champion, u.x, u.y)
        this.announce('적 챔피언 처치! +320G', '#ffd166')
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

    // 패시브 골드 수급
    this.gold += GOLD.perSecond * dt
    this.goldEarned += GOLD.perSecond * dt

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

  /** 우선순위: 미니언/챔피언 → 구조물 */
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
      z: attacker.kind === 'champion' ? 34 : attacker.radius,
      x2: target.x,
      y2: target.y,
      z2: target.radius,
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

  reap() {
    this.units = this.units.filter((u) => u.alive || u.kind === 'champion')
  }

  checkWin() {
    const blueNexus = this.units.find((u) => u.kind === 'nexus' && u.team === 'blue')
    const redNexus = this.units.find((u) => u.kind === 'nexus' && u.team === 'red')
    if (redNexus && !redNexus.alive) this.winner = 'blue'
    else if (blueNexus && !blueNexus.alive) this.winner = 'red'
  }

  // ─────────────────────────── HUD 스냅샷 ───────────────────────────

  getHud() {
    const p = this.player
    const e = this.enemy
    const eff = this.itemTotals()
    return {
      time: this.time,
      winner: this.winner,
      wave: this.waveCount,
      champKills: this.champKills,
      gold: Math.floor(this.gold),
      items: p.items.slice(),
      itemTotals: eff,
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
        atk: Math.round(p.atk),
        ap: Math.round((p.ap || 0) * 100),
        speed: Math.round(p.speed),
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
