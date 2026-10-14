import { ITEMS, MAX_ITEMS } from '../game/constants.js'

const fmt = (t) => {
  const s = Math.max(0, Math.floor(t))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`

export default function Hud({ hud, running, toast, shopOpen, onStart, onRestart, onToggleShop, onBuy, onCast }) {
  if (!hud) return null
  const { player, enemy, abilities, champKills, winner, time, wave, gold, items, itemTotals } = hud
  const over = Boolean(winner)

  return (
    <div className="hud">
      {/* 좌상단: 내 챔피언 */}
      <div className="panel player-panel">
        <div className="champ-row">
          <div className="portrait">
            <span className="lvl">{player.level}</span>
          </div>
          <div className="bars">
            <div className="bar hp">
              <div className="fill" style={{ width: pct(player.hp, player.maxHp) }} />
              <span className="bar-text">{player.hp} / {player.maxHp}</span>
            </div>
            <div className="bar mana">
              <div className="fill" style={{ width: pct(player.mana, player.maxMana) }} />
              <span className="bar-text">{player.mana} / {player.maxMana}</span>
            </div>
            <div className="bar xp">
              <div className="fill" style={{ width: pct(player.xp, player.xpNext) }} />
            </div>
          </div>
          <div className="gold-chip">🪙 {gold}</div>
        </div>

        <div className="stat-row">
          <span className="stat"><b>{player.kills}</b> 처치</span>
          <span className="stat"><b>{player.cs}</b> 미니언</span>
          <span className="stat"><b>{player.towers}</b> 타워</span>
        </div>

        <div className="power-row">
          <span>⚔️ {player.atk}</span>
          <span>✨ {player.ap}%</span>
          <span>👟 {player.speed}</span>
        </div>

        <div className="inv-row">
          {Array.from({ length: MAX_ITEMS }).map((_, i) => {
            const id = items[i]
            const item = id ? ITEMS.find((it) => it.id === id) : null
            return (
              <div key={i} className={`inv-slot ${item ? 'filled' : ''}`} title={item ? `${item.name} — ${item.desc}` : '빈 칸'}>
                {item ? item.icon : ''}
              </div>
            )
          })}
        </div>

        <button className="shop-btn" type="button" onClick={onToggleShop}>
          🛒 상점 <em>(B)</em>
        </button>

        {!player.alive && !over && (
          <div className="respawn">부활까지 {player.respawn.toFixed(1)}초</div>
        )}
      </div>

      {/* 상단 중앙: 스코어보드 */}
      <div className="panel scoreboard">
        <span className="team blue">{champKills.blue}</span>
        <span className="mid">
          <span className="timer">{fmt(time)}</span>
          <span className="wave">웨이브 {wave}</span>
        </span>
        <span className="team red">{champKills.red}</span>
      </div>

      {/* 우상단: 적 챔피언 */}
      <div className="panel enemy-panel">
        <div className="enemy-name">적 챔피언 <span className="lvl-chip">Lv.{enemy.level}</span></div>
        <div className="bar hp enemy">
          <div className="fill" style={{ width: pct(enemy.hp, enemy.maxHp) }} />
        </div>
        <div className="enemy-hp">{enemy.hp} / {enemy.maxHp}</div>
      </div>

      {/* 하단 중앙: 스킬 바 */}
      <div className="ability-bar">
        {abilities.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`ability ${a.ready ? 'ready' : ''} ${a.noMana ? 'nomano' : ''}`}
            onClick={() => onCast(a.key)}
            title={`${a.name} — ${a.desc} (${a.mana} MP)`}
          >
            <div className="ability-key">{a.key}</div>
            <div className="ability-body">
              <div className="ability-name">{a.name}</div>
              <div className="ability-cost">{a.mana} MP</div>
            </div>
            {a.ratio > 0 && (
              <>
                <div className="cooldown-mask" style={{ height: `${a.ratio * 100}%` }} />
                <div className="cooldown-num">{a.cd < 1 ? a.cd.toFixed(1) : Math.ceil(a.cd)}</div>
              </>
            )}
          </button>
        ))}
      </div>

      {/* 좌하단: 조작 안내 */}
      <div className="panel hint">
        <div><b>좌/우 클릭</b> 이동</div>
        <div><b>Q W E R</b> 스킬 (커서 방향)</div>
        <div><b>B</b> 상점 · <b>Space</b> 정지</div>
      </div>

      {toast && <div className={`toast ${toast.kind || 'error'}`}>{toast.text}</div>}

      {/* 상점 */}
      {shopOpen && (
        <div className="shop">
          <div className="shop-head">
            <h2>상점</h2>
            <span className="shop-gold">🪙 {gold}</span>
            <button className="shop-close" type="button" onClick={onToggleShop} aria-label="닫기">✕</button>
          </div>
          <div className="shop-totals">
            {itemTotals.atk > 0 && <span>공격력 +{itemTotals.atk}</span>}
            {itemTotals.ap > 0 && <span>주문력 +{Math.round(itemTotals.ap * 100)}%</span>}
            {itemTotals.maxHp > 0 && <span>체력 +{itemTotals.maxHp}</span>}
            {itemTotals.maxMana > 0 && <span>마나 +{itemTotals.maxMana}</span>}
            {itemTotals.speed > 0 && <span>이동 +{itemTotals.speed}</span>}
            {itemTotals.atkSpeed > 0 && <span>공속 +{Math.round(itemTotals.atkSpeed * 100)}%</span>}
          </div>
          <div className="shop-list">
            {ITEMS.map((it) => {
              const owned = items.filter((x) => x === it.id).length
              const afford = gold >= it.cost
              const full = items.length >= MAX_ITEMS
              const usable = afford && !full && player.alive
              return (
                <button
                  key={it.id}
                  type="button"
                  className={`shop-item ${usable ? '' : 'disabled'}`}
                  onClick={() => onBuy(it.id)}
                  disabled={!usable}
                >
                  <span className="si-icon">{it.icon}</span>
                  <span className="si-main">
                    <span className="si-name">
                      {it.name}
                      {owned > 0 && <em> ×{owned}</em>}
                    </span>
                    <span className="si-desc">{it.desc}</span>
                  </span>
                  <span className={`si-cost ${afford ? '' : 'poor'}`}>{it.cost}</span>
                </button>
              )
            })}
          </div>
          <div className="shop-foot">미니언 막타·타워·챔피언 처치로 골드를 획득하세요 · 최대 {MAX_ITEMS}칸</div>
        </div>
      )}

      {/* 오버레이: 시작 / 결과 */}
      {(!running || over) && (
        <div className="overlay">
          <div className="overlay-card">
            <h1 className="title">리그 오브 레전드</h1>
            <p className="subtitle">3D 미니 MOBA — 적 넥서스를 파괴하라</p>

            {over && (
              <div className={`result ${winner === 'blue' ? 'win' : 'lose'}`}>
                {winner === 'blue' ? 'VICTORY 승리!' : 'DEFEAT 패배'}
              </div>
            )}

            <ul className="how">
              <li><b>좌/우 클릭</b> — 이동 (미니언·타워가 함께 싸웁니다)</li>
              <li><b>Q</b> 비전 투척 · <b>W</b> 충격파 · <b>E</b> 질풍 · <b>R</b> 대재앙</li>
              <li><b>B</b> — 상점 열기, 골드로 아이템을 구매해 챔피언을 강화하세요</li>
              <li>미니언을 <b>막타</b>로 처치하면 골드를 획득합니다</li>
            </ul>

            <button className="start-btn" type="button" onClick={over ? onRestart : onStart}>
              {over ? '다시 도전' : '게임 시작'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
