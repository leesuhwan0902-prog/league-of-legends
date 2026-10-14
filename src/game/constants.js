// 월드/맵/유닛/스킬 밸런스 상수

export const WORLD = { w: 2600, h: 2600 }

export const BASES = {
  blue: { x: 320, y: 2280 },
  red: { x: 2280, y: 320 },
}

// 레인(차선) 방향 벡터와 수직 벡터
const _dx = BASES.red.x - BASES.blue.x
const _dy = BASES.red.y - BASES.blue.y
const _len = Math.hypot(_dx, _dy)
const _ux = _dx / _len
const _uy = _dy / _len
const _px = -_uy
const _py = _ux

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/** 레인 위의 한 점. t: 0(블루 넥서스) ~ 1(레드 넥서스), offset: 레인 수직 오프셋 */
export function lanePoint(t, offset = 0) {
  return {
    x: BASES.blue.x + _dx * t + _px * offset,
    y: BASES.blue.y + _dy * t + _py * offset,
  }
}

/** 해당 좌표가 레인 중심선에서 얼마나 떨어져 있는지 */
export function distToLane(x, y) {
  const ax = BASES.blue.x
  const ay = BASES.blue.y
  const t = clamp(((x - ax) * _dx + (y - ay) * _dy) / (_dx * _dx + _dy * _dy), 0, 1)
  return Math.hypot(x - (ax + _dx * t), y - (ay + _dy * t))
}

export const TOWER_POSITIONS = [
  { team: 'blue', t: 0.16, offset: 95 },
  { team: 'blue', t: 0.31, offset: -95 },
  { team: 'red', t: 0.69, offset: -95 },
  { team: 'red', t: 0.84, offset: 95 },
]

export const TEAM_LABEL = { blue: '블루', red: '레드' }

export const COLORS = {
  blue: { base: '#4cc2ff', dark: '#1c6fb0', light: '#bfe9ff', minion: '#4a90d9' },
  red: { base: '#ff6b6b', dark: '#b03a3a', light: '#ffd0d0', minion: '#d95a5a' },
}

export const CHAMPION_STATS = {
  hp: 640,
  mana: 330,
  atk: 26,
  atkRange: 150,
  atkSpeed: 1.15,
  speed: 205,
  radius: 18,
  aggroRange: 440,
  manaRegen: 9,
}

export const MINION_STATS = {
  melee: {
    hp: 150, atk: 11, atkRange: 74, atkSpeed: 1.1, speed: 96, radius: 13, aggroRange: 215,
  },
  ranged: {
    hp: 100, atk: 17, atkRange: 195, atkSpeed: 0.95, speed: 96, radius: 11, aggroRange: 230,
  },
}

export const TOWER_STATS = {
  hp: 1300, atk: 62, atkRange: 330, atkSpeed: 0.85, radius: 27, aggroRange: 330,
}

export const NEXUS_STATS = {
  hp: 4200, atk: 0, atkRange: 0, atkSpeed: 0, radius: 46, aggroRange: 0,
}

export const WAVE_INTERVAL = 13
export const FIRST_WAVE_DELAY = 5

export const XP_REWARD = { minion: 32, tower: 170, champion: 320 }

/** 골드 획득 설정 */
export const GOLD = {
  start: 500,
  perSecond: 1.8,
  minionMelee: 26,
  minionRanged: 20,
  tower: 180,
  champion: 320,
}

/** 아이템 상점 (최대 6칸) */
export const MAX_ITEMS = 6

export const ITEMS = [
  { id: 'long-sword', name: '롱소드', icon: '⚔️', cost: 350, stats: { atk: 12 }, desc: '공격력 +12' },
  { id: 'dagger', name: '단검', icon: '🗡️', cost: 300, stats: { atkSpeed: 0.15 }, desc: '공격 속도 +15%' },
  { id: 'ruby', name: '루비 수정', icon: '❤️', cost: 400, stats: { maxHp: 150 }, desc: '최대 체력 +150' },
  { id: 'sapphire', name: '사파이어 수정', icon: '💧', cost: 350, stats: { maxMana: 120 }, desc: '최대 마나 +120' },
  { id: 'boots', name: '장화', icon: '👟', cost: 300, stats: { speed: 30 }, desc: '이동 속도 +30' },
  { id: 'tome', name: '주문서', icon: '📕', cost: 400, stats: { ap: 0.12 }, desc: '스킬 피해 +12%' },
  { id: 'pickaxe', name: '곡괭이', icon: '⛏️', cost: 875, stats: { atk: 25 }, desc: '공격력 +25' },
  { id: 'belt', name: '거인의 허리띠', icon: '🧣', cost: 900, stats: { maxHp: 350 }, desc: '최대 체력 +350' },
  { id: 'codex', name: '마법사의 고서', icon: '📘', cost: 1100, stats: { ap: 0.22, maxMana: 150 }, desc: '스킬 피해 +22%, 최대 마나 +150' },
  { id: 'rod', name: '대천사의 지팡이', icon: '🔮', cost: 2900, stats: { ap: 0.4, maxMana: 250 }, desc: '스킬 피해 +40%, 최대 마나 +250' },
  { id: 'ie', name: '무한의 대검', icon: '🏆', cost: 3400, stats: { atk: 70, atkSpeed: 0.1 }, desc: '공격력 +70, 공격 속도 +10%' },
  { id: 'ga', name: '수호 천사', icon: '🛡️', cost: 3200, stats: { maxHp: 400, atk: 35 }, desc: '최대 체력 +400, 공격력 +35' },
]

export const ITEMS_BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]))


export const ABILITIES = {
  Q: {
    slot: 'Q', name: '비전 투척', desc: '직선으로 관통하는 마법 투사체',
    type: 'skillshot', mana: 40, cd: 6, damage: 95, speed: 640, range: 560, radius: 13, color: '#7dd3fc',
  },
  W: {
    slot: 'W', name: '충격파', desc: '주변 적에게 광역 피해',
    type: 'nova', mana: 50, cd: 9, damage: 115, radius: 155, color: '#a78bfa',
  },
  E: {
    slot: 'E', name: '질풍', desc: '커서 방향으로 순간이동',
    type: 'dash', mana: 40, cd: 10, distance: 310, color: '#34d399',
  },
  R: {
    slot: 'R', name: '대재앙', desc: '지정 지점에 거대한 광역 피해',
    type: 'ground', mana: 100, cd: 42, damage: 270, radius: 215, range: 540, color: '#f59e0b',
  },
}

export const ABILITY_ORDER = ['Q', 'W', 'E', 'R']

/** 결정론적 난수 (장식물 배치용) */
export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
