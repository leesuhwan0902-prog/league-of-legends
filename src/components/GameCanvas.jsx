import { useCallback, useEffect, useRef, useState } from 'react'
import { Game } from '../game/Game.js'
import { Scene3D } from '../game/Scene3D.js'
import { drawOverlay } from '../game/overlay.js'
import Hud from './Hud.jsx'

const ABILITY_KEYS = ['Q', 'W', 'E', 'R']

export default function GameCanvas() {
  const glRef = useRef(null)
  const uiRef = useRef(null)
  const gameRef = useRef(null)
  const viewRef = useRef({ w: 900, h: 600 })
  const dprRef = useRef(1)
  const mouseRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 })
  const runningRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [hud, setHud] = useState(null)
  const [toast, setToast] = useState(null)
  const [shopOpen, setShopOpen] = useState(false)

  const start = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    if (g.winner) g.reset()
    runningRef.current = true
    setRunning(true)
    setHud(g.getHud())
  }, [])

  const restart = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    g.reset()
    runningRef.current = true
    setRunning(true)
    setShopOpen(false)
    setHud(g.getHud())
  }, [])

  const toggleShop = useCallback(() => setShopOpen((v) => !v), [])

  const cast = useCallback((key) => {
    const g = gameRef.current
    if (!g || !runningRef.current) return
    const res = g.castAbility(key, mouseRef.current.wx, mouseRef.current.wy)
    if (res && !res.ok && (res.reason === 'mana' || res.reason === 'cooldown')) {
      setToast({ id: Date.now(), kind: 'error', text: res.reason === 'mana' ? '마나 부족' : '재사용 대기 중' })
    }
  }, [])

  const buy = useCallback((id) => {
    const g = gameRef.current
    if (!g) return
    const res = g.buyItem(id)
    if (!res.ok) {
      const msg = {
        gold: '골드가 부족합니다',
        full: '아이템 칸이 가득 찼습니다 (최대 6개)',
        dead: '사망 상태에서는 구매할 수 없습니다',
      }[res.reason] || '구매 실패'
      setToast({ id: Date.now(), kind: 'error', text: msg })
    } else {
      setToast({ id: Date.now(), kind: 'ok', text: `${res.item.icon} ${res.item.name} 구매 완료!` })
    }
    setHud(g.getHud())
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(null), 1400)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const glCanvas = glRef.current
    const uiCanvas = uiRef.current
    if (!glCanvas || !uiCanvas) return undefined

    const game = new Game()
    gameRef.current = game
    const scene = new Scene3D(glCanvas, game)
    const ctx = uiCanvas.getContext('2d')

    // 개발 모드에서만 게임 객체 노출 (프로덕션 빌드에서는 제거됨)
    if (import.meta.env.DEV) window.__lol = { game, scene }

    const resize = () => {
      const rect = glCanvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dprRef.current = dpr
      const w = Math.max(360, Math.floor(rect.width))
      const h = Math.max(280, Math.floor(rect.height))
      viewRef.current = { w, h }
      game.view = { w, h }
      scene.resize(w, h, dpr)
      uiCanvas.width = Math.floor(w * dpr)
      uiCanvas.height = Math.floor(h * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(glCanvas)

    let raf = 0
    let last = performance.now()
    let acc = 0

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000
      last = now
      if (!Number.isFinite(dt) || dt < 0) dt = 0
      dt = Math.min(dt, 0.05)

      if (runningRef.current) {
        game.update(dt)
        if (game.winner) {
          runningRef.current = false
          setRunning(false)
          setHud(game.getHud())
        }
      }

      // 3D 렌더
      scene.sync(game)
      scene.updateCamera(game, runningRef.current ? dt : Math.min(dt, 0.016))
      scene.render()

      // 2D 오버레이
      const view = viewRef.current
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0)
      ctx.clearRect(0, 0, view.w, view.h)
      drawOverlay(ctx, view, game, scene)

      acc += dt
      if (acc >= 0.05) {
        acc = 0
        setHud(game.getHud())
      }
    }
    raf = requestAnimationFrame(loop)

    const updateMouse = (e) => {
      const rect = uiCanvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      mouseRef.current.sx = sx
      mouseRef.current.sy = sy
      const w = scene.screenToWorld(sx, sy, viewRef.current)
      if (w) {
        mouseRef.current.wx = w.x
        mouseRef.current.wy = w.y
      }
    }
    const onDown = (e) => {
      updateMouse(e)
      if (!runningRef.current) return
      game.setMoveTarget(mouseRef.current.wx, mouseRef.current.wy)
    }
    const onContext = (e) => e.preventDefault()
    const onKey = (e) => {
      const k = e.key.toUpperCase()
      if (ABILITY_KEYS.includes(k)) {
        e.preventDefault()
        if (!runningRef.current) return
        updateMouseLast()
        const res = game.castAbility(k, mouseRef.current.wx, mouseRef.current.wy)
        if (res && !res.ok && (res.reason === 'mana' || res.reason === 'cooldown')) {
          setToast({ id: Date.now(), kind: 'error', text: res.reason === 'mana' ? '마나 부족' : '재사용 대기 중' })
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        if (runningRef.current) game.setMoveTarget(null, null)
      } else if (k === 'B') {
        e.preventDefault()
        setShopOpen((v) => !v)
      }
    }
    // 마지막 마우스 위치 재계산(카메라 이동 대비)
    const updateMouseLast = () => {
      const w = scene.screenToWorld(mouseRef.current.sx, mouseRef.current.sy, viewRef.current)
      if (w) {
        mouseRef.current.wx = w.x
        mouseRef.current.wy = w.y
      }
    }

    uiCanvas.addEventListener('mousemove', updateMouse)
    uiCanvas.addEventListener('mousedown', onDown)
    uiCanvas.addEventListener('contextmenu', onContext)
    window.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      uiCanvas.removeEventListener('mousemove', updateMouse)
      uiCanvas.removeEventListener('mousedown', onDown)
      uiCanvas.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKey)
      scene.dispose()
    }
  }, [])

  return (
    <div className="game-wrap">
      <canvas ref={glRef} className="gl-canvas" />
      <canvas ref={uiRef} className="ui-canvas" />
      <Hud
        hud={hud}
        running={running}
        toast={toast}
        shopOpen={shopOpen}
        onStart={start}
        onRestart={restart}
        onToggleShop={toggleShop}
        onBuy={buy}
        onCast={cast}
      />
    </div>
  )
}
