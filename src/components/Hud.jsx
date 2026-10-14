const fmt = (t) => {
  const s = Math.max(0, Math.floor(t))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`

export default function Hud({ hud, running, toast, onStart, onRestart }) {
  if (!hud) return null
  const { player, enemy, abilities, champKills, winner, time, wave } = hud
  const over = Boolean(winner)

  return (
    <div className="hud">
      {/* 좌상단: 내 챔피언 상태 */}
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
        </div>
        <div className="stat-row">
          <span className="stat"><b>{player.kills}</b> 처치</span>
          <span className="stat"><b>{player.cs}</b> 미니언</span>
          <span className="stat"><b>{player.towers}</b> 타워</span>
        </div>
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
          <div key={a.key} className={`ability ${a.ready ? 'ready' : ''} ${a.noMana ? 'nomano' : ''}`}>
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
          </div>
        ))}
      </div>

      {/* 좌하단: 조작 안내 */}
      <div className="panel hint">
        <div><b>좌/우 클릭</b> 이동</div>
        <div><b>Q W E R</b> 스킬 (커서 방향)</div>
        <div><b>Space</b> 정지</div>
      </div>

      {toast && <div className="toast">{toast.text}</div>}

      {/* 오버레이: 시작 / 결과 */}
      {(!running || over) && (
        <div className="overlay">
          <div className="overlay-card">
            <h1 className="title">리그 오브 레전드</h1>
            <p className="subtitle">미니 MOBA — 적 넥서스를 파괴하라</p>

            {over && (
              <div className={`result ${winner === 'blue' ? 'win' : 'lose'}`}>
                {winner === 'blue' ? 'VICTORY 승리!' : 'DEFEAT 패배'}
              </div>
            )}

            <ul className="how">
              <li><b>좌/우 클릭</b> — 이동 (미니언·타워가 함께 싸웁니다)</li>
              <li><b>Q</b> 비전 투척 · <b>W</b> 충격파 · <b>E</b> 질풍 · <b>R</b> 대재앙</li>
              <li>스킬은 <b>마우스 커서 방향</b>으로 발동됩니다</li>
              <li>미니언을 처치해 <b>레벨업</b>하고, 타워를 밀어 <b>넥서스</b>를 파괴하세요</li>
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
