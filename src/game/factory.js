// 유닛 생성 팩토리 (플레인 오브젝트 기반)
import { CHAMPION_STATS, MINION_STATS, TOWER_STATS, NEXUS_STATS } from './constants.js'

let nextId = 1
export const uid = () => nextId++

export function createChampion(team, pos, isPlayer) {
  const s = CHAMPION_STATS
  return {
    id: uid(),
    kind: 'champion',
    team,
    isPlayer,
    name: isPlayer ? '플레이어' : '적 챔피언',
    x: pos.x,
    y: pos.y,
    radius: s.radius,
    hp: s.hp,
    maxHp: s.hp,
    mana: s.mana,
    maxMana: s.mana,
    atk: s.atk,
    atkRange: s.atkRange,
    atkSpeed: s.atkSpeed,
    speed: s.speed,
    aggroRange: s.aggroRange,
    manaRegen: s.manaRegen,
    alive: true,
    attackCd: 0,
    hitFlash: 0,
    moveTarget: null,
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    level: 1,
    xp: 0,
    xpNext: 160,
    ap: 0,
    items: [],
    respawnTimer: 0,
    facing: 0,
    lastHitBy: null,
  }
}

export function createMinion(team, pos, ranged, scale = 1) {
  const s = ranged ? MINION_STATS.ranged : MINION_STATS.melee
  const hp = Math.round(s.hp * scale)
  return {
    id: uid(),
    kind: 'minion',
    team,
    ranged,
    x: pos.x,
    y: pos.y,
    radius: s.radius,
    hp,
    maxHp: hp,
    atk: Math.round(s.atk * scale),
    atkRange: s.atkRange,
    atkSpeed: s.atkSpeed,
    speed: s.speed,
    aggroRange: s.aggroRange,
    mana: 0,
    maxMana: 0,
    alive: true,
    attackCd: 0,
    hitFlash: 0,
    lastHitBy: null,
  }
}

export function createStructure(kind, team, pos) {
  const s = kind === 'tower' ? TOWER_STATS : NEXUS_STATS
  return {
    id: uid(),
    kind,
    team,
    x: pos.x,
    y: pos.y,
    radius: s.radius,
    hp: s.hp,
    maxHp: s.hp,
    atk: s.atk,
    atkRange: s.atkRange,
    atkSpeed: s.atkSpeed,
    speed: 0,
    aggroRange: s.aggroRange,
    mana: 0,
    maxMana: 0,
    alive: true,
    attackCd: 0,
    hitFlash: 0,
    lastHitBy: null,
  }
}
