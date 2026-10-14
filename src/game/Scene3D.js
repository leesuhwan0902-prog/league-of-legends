// three.js 기반 3D 전장 렌더러
// 월드 좌표계: 게임의 (x, y) → 3D의 (x, 0, y)  (게임 y = 3D z)
import * as THREE from 'three'
import { WORLD, BASES, lanePoint } from './constants.js'

const TEAM_HEX = { blue: 0x4cc2ff, red: 0xff6b6b }
const LANE_ANGLE = Math.PI / 4

const std = (color, emissive, emissiveIntensity = 0.15, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive: emissive ?? color, emissiveIntensity, roughness: 0.55, metalness: 0.15, ...extra })

export class Scene3D {
  constructor(canvas, game) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x05070d, 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x070d16, 1500, 3800)

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 9000)
    this.camTarget = new THREE.Vector3(WORLD.w / 2, 0, WORLD.h / 2)
    this.camOffset = new THREE.Vector3(0, 900, 720)
    this.lookOffset = new THREE.Vector3(0, 0, -100)

    this.views = new Map()
    this.projViews = new Map()
    this._projMats = new Map()

    this._raycaster = new THREE.Raycaster()
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this._v = new THREE.Vector3()
    this._hitV = new THREE.Vector3()
    this._ndc = new THREE.Vector2()
    this._projOut = { x: 0, y: 0, visible: false }

    this._buildShared()
    this._buildLights()
    this._buildMap(game)
  }

  // ─────────────────────────── 구성 ───────────────────────────

  _buildShared() {
    this.geo = {
      minionMelee: new THREE.CapsuleGeometry(11, 14, 4, 10),
      minionRanged: new THREE.ConeGeometry(11, 30, 6),
      champBody: new THREE.CapsuleGeometry(16, 34, 6, 16),
      champHead: new THREE.SphereGeometry(14, 14, 10),
      nose: new THREE.ConeGeometry(5, 16, 6),
      ring: new THREE.RingGeometry(0.9, 1, 44),
      towerBase: new THREE.CylinderGeometry(24, 34, 66, 8),
      towerTop: new THREE.ConeGeometry(22, 42, 8),
      nexus: new THREE.OctahedronGeometry(36, 0),
      bullet: new THREE.SphereGeometry(1, 12, 8),
      rock: new THREE.IcosahedronGeometry(1, 0),
      tree: new THREE.ConeGeometry(1, 1, 7),
    }

    this.mat = {
      minion: {
        blue: std(0x4a90d9, 0x1c4f80, 0.2),
        red: std(0xd95a5a, 0x802020, 0.2),
      },
      champ: {
        blue: std(0x2f86c9, 0x4cc2ff, 0.45),
        red: std(0xc94a4a, 0xff6b6b, 0.45),
      },
      champHead: {
        blue: std(0xbfe9ff, 0x4cc2ff, 0.6),
        red: std(0xffd0d0, 0xff6b6b, 0.6),
      },
      accent: {
        blue: std(0xd9f2ff, 0x9be7ff, 0.9),
        red: std(0xffe0e0, 0xffb3b3, 0.9),
      },
      tower: {
        blue: std(0x2f6fb0, 0x1a3f66, 0.2),
        red: std(0xb04a4a, 0x66201a, 0.2),
      },
      towerTop: {
        blue: std(0x8fd4ff, 0x4cc2ff, 0.7),
        red: std(0xffb3b3, 0xff6b6b, 0.7),
      },
      nexus: {
        blue: std(0x1c6fb0, 0x4cc2ff, 1.2, { roughness: 0.2 }),
        red: std(0xa02f2f, 0xff6b6b, 1.2, { roughness: 0.2 }),
      },
      ring: {
        blue: new THREE.MeshBasicMaterial({ color: TEAM_HEX.blue, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
        red: new THREE.MeshBasicMaterial({ color: TEAM_HEX.red, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      },
      decor: {
        tree: std(0x1c4a2c, 0x0d2a18, 0.1),
        rock: std(0x2b3630, 0x141a17, 0.05),
      },
    }
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9ec8ff, 0x16281c, 0.9))

    const sun = new THREE.DirectionalLight(0xfff2d5, 1.6)
    sun.position.set(600, 950, 400)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const s = 900
    sun.shadow.camera.left = -s
    sun.shadow.camera.right = s
    sun.shadow.camera.top = s
    sun.shadow.camera.bottom = -s
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 4000
    sun.shadow.bias = -0.0008
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sun = sun

    this.scene.add(new THREE.AmbientLight(0x33406b, 0.5))
  }

  _flatPlane(w, h, color, opacity = 1) {
    const g = new THREE.PlaneGeometry(w, h)
    g.rotateX(-Math.PI / 2)
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0,
      transparent: opacity < 1,
      opacity,
    })
    return new THREE.Mesh(g, m)
  }

  _buildMap(game) {
    // 바닥
    const ground = this._flatPlane(WORLD.w, WORLD.h, 0x13251a)
    ground.position.set(WORLD.w / 2, 0, WORLD.h / 2)
    ground.receiveShadow = true
    this.scene.add(ground)

    // 레인
    const laneLen = Math.hypot(BASES.red.x - BASES.blue.x, BASES.red.y - BASES.blue.y)
    const laneGeo = new THREE.PlaneGeometry(laneLen, 260)
    laneGeo.rotateX(-Math.PI / 2)
    laneGeo.rotateY(-LANE_ANGLE)
    const lane = new THREE.Mesh(laneGeo, new THREE.MeshStandardMaterial({ color: 0x3b4a3c, roughness: 1 }))
    lane.position.set((BASES.blue.x + BASES.red.x) / 2, 1, (BASES.blue.y + BASES.red.y) / 2)
    lane.receiveShadow = true
    this.scene.add(lane)

    const laneInnerGeo = new THREE.PlaneGeometry(laneLen, 190)
    laneInnerGeo.rotateX(-Math.PI / 2)
    laneInnerGeo.rotateY(-LANE_ANGLE)
    const laneInner = new THREE.Mesh(laneInnerGeo, new THREE.MeshStandardMaterial({ color: 0x475a47, roughness: 1 }))
    laneInner.position.set((BASES.blue.x + BASES.red.x) / 2, 1.6, (BASES.blue.y + BASES.red.y) / 2)
    laneInner.receiveShadow = true
    this.scene.add(laneInner)

    // 강
    const mid = lanePoint(0.5)
    const riverGeo = new THREE.PlaneGeometry(3600, 210)
    riverGeo.rotateX(-Math.PI / 2)
    riverGeo.rotateY(-LANE_ANGLE + Math.PI / 2)
    const river = new THREE.Mesh(
      riverGeo,
      new THREE.MeshStandardMaterial({ color: 0x2e7caa, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.5 }),
    )
    river.position.set(mid.x, 2, mid.y)
    this.scene.add(river)

    // 진영 기지
    for (const team of ['blue', 'red']) {
      const base = BASES[team]
      const g = new THREE.CircleGeometry(300, 48)
      g.rotateX(-Math.PI / 2)
      const m = new THREE.MeshBasicMaterial({ color: TEAM_HEX[team], transparent: true, opacity: 0.14, side: THREE.DoubleSide })
      const disc = new THREE.Mesh(g, m)
      disc.position.set(base.x, 2.4, base.y)
      this.scene.add(disc)
    }

    // 정글 장식
    for (const d of game.decor) {
      if (d.rock) {
        const mesh = new THREE.Mesh(this.geo.rock, this.mat.decor.rock)
        mesh.scale.set(d.r, d.r * 0.7, d.r)
        mesh.position.set(d.x, d.r * 0.4, d.y)
        mesh.rotation.set(Math.random(), Math.random(), Math.random())
        this.scene.add(mesh)
      } else {
        const h = d.r * 2.4
        const mesh = new THREE.Mesh(this.geo.tree, this.mat.decor.tree)
        mesh.scale.set(d.r, h, d.r)
        mesh.position.set(d.x, h / 2, d.y)
        this.scene.add(mesh)
      }
    }
  }

  // ─────────────────────────── 유닛 뷰 ───────────────────────────

  _createView(u) {
    const group = new THREE.Group()
    const team = u.team
    const view = { group, seen: true }

    if (u.kind === 'minion') {
      const geo = u.ranged ? this.geo.minionRanged : this.geo.minionMelee
      const body = new THREE.Mesh(geo, this.mat.minion[team])
      body.position.y = u.ranged ? 15 : 20
      body.castShadow = true
      group.add(body)
      view.body = body
    } else if (u.kind === 'champion') {
      const body = new THREE.Mesh(this.geo.champBody, this.mat.champ[team])
      body.position.y = 32
      body.castShadow = true
      const head = new THREE.Mesh(this.geo.champHead, this.mat.champHead[team])
      head.position.y = 60
      head.castShadow = true
      const nose = new THREE.Mesh(this.geo.nose, this.mat.accent[team])
      nose.position.set(18, 34, 0)
      nose.rotation.z = -Math.PI / 2
      const ring = new THREE.Mesh(this.geo.ring, this.mat.ring[team])
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 1.8
      const ringScale = u.radius * 2.6
      ring.scale.set(ringScale, ringScale, ringScale)
      group.add(body, head, nose, ring)
      view.body = body
      view.head = head
      view.ring = ring
    } else if (u.kind === 'tower') {
      const base = new THREE.Mesh(this.geo.towerBase, this.mat.tower[team])
      base.position.y = 33
      base.castShadow = true
      const top = new THREE.Mesh(this.geo.towerTop, this.mat.towerTop[team])
      top.position.y = 86
      top.castShadow = true
      group.add(base, top)
      view.body = top
    } else if (u.kind === 'nexus') {
      const mesh = new THREE.Mesh(this.geo.nexus, this.mat.nexus[team])
      mesh.position.y = 56
      mesh.castShadow = true
      group.add(mesh)
      view.body = mesh
    }

    group.position.set(u.x, 0, u.y)
    this.scene.add(group)
    return view
  }

  _projMat(color) {
    if (!this._projMats.has(color)) {
      this._projMats.set(color, new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2,
        roughness: 0.25,
        metalness: 0.1,
      }))
    }
    return this._projMats.get(color)
  }

  sync(game) {
    for (const v of this.views.values()) v.seen = false

    for (const u of game.units) {
      let v = this.views.get(u.id)
      if (!v) {
        v = this._createView(u)
        this.views.set(u.id, v)
      }
      v.seen = true
      v.group.visible = u.alive
      if (!u.alive) continue

      v.group.position.set(u.x, 0, u.y)
      v.group.rotation.y = -(u.facing || 0)
      if (v.body) v.body.scale.setScalar(1 + Math.max(0, u.hitFlash) * 0.9)

      if (u.kind === 'nexus' && v.body) {
        v.body.rotation.y += 0.012
        v.body.position.y = 56 + Math.sin(game.time * 2) * 5
      } else if (u.kind === 'champion' && v.head) {
        v.head.position.y = 60 + Math.sin(game.time * 4 + u.id) * 1.5
      }
    }

    for (const [id, v] of this.views) {
      if (!v.seen) {
        this.scene.remove(v.group)
        this.views.delete(id)
      }
    }

    // 투사체
    for (const v of this.projViews.values()) v.seen = false
    for (const pr of game.projectiles) {
      let v = this.projViews.get(pr)
      if (!v) {
        const mesh = new THREE.Mesh(this.geo.bullet, this._projMat(pr.color))
        mesh.scale.setScalar(pr.radius)
        this.scene.add(mesh)
        v = { mesh, seen: true }
        this.projViews.set(pr, v)
      }
      v.seen = true
      v.mesh.position.set(pr.x, 36, pr.y)
    }
    for (const [pr, v] of this.projViews) {
      if (!v.seen) {
        this.scene.remove(v.mesh)
        this.projViews.delete(pr)
      }
    }
  }

  // ─────────────────────────── 카메라 / 좌표 ───────────────────────────

  updateCamera(game, dt) {
    const p = game.player
    const a = 1 - Math.exp(-7 * dt)
    this.camTarget.x += (p.x - this.camTarget.x) * a
    this.camTarget.z += (p.y - this.camTarget.z) * a

    this.camera.position.set(this.camTarget.x + this.camOffset.x, this.camOffset.y, this.camTarget.z + this.camOffset.z)
    this.camera.lookAt(this.camTarget.x + this.lookOffset.x, this.lookOffset.y, this.camTarget.z + this.lookOffset.z)
    this.camera.updateMatrixWorld()

    this.sun.position.set(this.camTarget.x + 600, 950, this.camTarget.z + 400)
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z)
    this.sun.target.updateMatrixWorld()
  }

  /** 월드 좌표 → 화면 좌표 */
  project(wx, wy, elev, view) {
    this._v.set(wx, elev || 0, wy)
    this._v.project(this.camera)
    const out = this._projOut
    out.x = (this._v.x * 0.5 + 0.5) * view.w
    out.y = (-this._v.y * 0.5 + 0.5) * view.h
    out.visible = this._v.z < 1
    return out
  }

  /** 화면 좌표 → 지면(y=0) 위의 월드 좌표 */
  screenToWorld(sx, sy, view) {
    this._ndc.set((sx / view.w) * 2 - 1, -(sy / view.h) * 2 + 1)
    this._raycaster.setFromCamera(this._ndc, this.camera)
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._hitV)
    if (!hit) return null
    return { x: hit.x, y: hit.z }
  }

  /** 화면에 보이는 지면 영역(미니맵 카메라 사각형용) */
  viewBounds(view) {
    const corners = [[0, 0], [view.w, 0], [view.w, view.h], [0, view.h]]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [sx, sy] of corners) {
      const w = this.screenToWorld(sx, sy, view)
      if (!w) continue
      minX = Math.min(minX, w.x)
      maxX = Math.max(maxX, w.x)
      minY = Math.min(minY, w.y)
      maxY = Math.max(maxY, w.y)
    }
    if (!Number.isFinite(minX)) return null
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  resize(w, h, dpr) {
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    for (const v of this.views.values()) this.scene.remove(v.group)
    for (const v of this.projViews.values()) this.scene.remove(v.mesh)
    this.views.clear()
    this.projViews.clear()
    this.renderer.dispose()
  }
}
