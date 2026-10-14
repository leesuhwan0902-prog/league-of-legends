import { useCallback, useEffect, useRef, useState } from 'react'
import { Game } from '../game/Game.js'
import Hud from './Hud.jsx'

const ABILITY_KEYS = ['Q', 'W', 'E', 'R']

export default function GameCanvas() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const viewRef = useRef({ w: 900, h: 600 })
  const dprRef = useRef(1)
  const mouseRef = useRef({ wx: 0, wy: 0 })
  const runningRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [hud, setHud] = useState(null)
  const [toast, setToast] = useState(null)

  const start = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    if (g.winner) g.reset()
    g.view = viewRef.current
    runningRef.current = true
    setRunning(true)
    setHud(g.getHud())
  }, [])

  const restart = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    g.reset()
    g.view = viewRef.current
    runningRef.current = true
    setRunning(true)
    setHud(g.getHud())
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(null), 900)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    const game = new Game()
    gameRef.current = game

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dprRef.current = dpr
      const w = Math.max(360, Math.floor(rect.width))
      const h = Math.max(280, Math.floor(rect.height))
      viewRef.current = { w, h }
      game.view = { w, h }
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

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
      game.render(ctx, viewRef.current, dprRef.current)

      acc += dt
      if (acc >= 0.05) {
        acc = 0
        setHud(game.getHud())
      }
    }
    raf = requestAnimationFrame(loop)

    const toWorld = (e) => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      mouseRef.current.wx = sx + game.camera.x
      mouseRef.current.wy = sy + game.camera.y
    }
    const onMove = (e) => toWorld(e)
    const onDown = (e) => {
      toWorld(e)
      if (!runningRef.current) return
      game.setMoveTarget(mouseRef.current.wx, mouseRef.current.wy)
    }
    const onContext = (e) => e.preventDefault()
    const onKey = (e) => {
      const k = e.key.toUpperCase()
      if (ABILITY_KEYS.includes(k)) {
        e.preventDefault()
        if (!runningRef.current) return
        const res = game.castAbility(k, mouseRef.current.wx, mouseRef.current.wy)
        if (res && !res.ok && (res.reason === 'mana' || res.reason === 'cooldown')) {
          setToast({ id: Date.now(), text: res.reason === 'mana' ? '마나 부족' : '재사용 대기 중' })
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        if (runningRef.current) game.setMoveTarget(null, null)
      }
    }

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('contextmenu', onContext)
    window.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="game-wrap">
      <canvas ref={canvasRef} className="game-canvas" />
      <Hud hud={hud} running={running} toast={toast} onStart={start} onRestart={restart} />
    </div>
  )
}
