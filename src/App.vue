<template>
  <div class="engine-root">
    <div ref="mountRef" class="mount"></div>
    <div class="crosshair" :class="{ locked: pointerLocked }"></div>

    <!-- 顶栏 -->
    <div class="topbar">
      <button class="chip ui-toggle" @click="toggleUI">{{ showUI ? '👁' : '👁' }}</button>
      <div class="fps">⚡ {{ fps.toFixed(0) }} fps</div>
    </div>

    <!-- 底部热键栏 -->
    <div class="hotbar">
      <div v-for="(b, i) in blockTypes" :key="b.key"
        class="slot" :class="{ active: i === selectedSlot }"
        @click="selectedSlot = i"
        :style="{ background: b.color }">
        <span class="slotNum">{{ i + 1 }}</span>
      </div>
    </div>

    <!-- 按键提示 -->
    <div class="help">
      <div><b>W A S D</b> 移动</div>
      <div><b>空格</b> 跳跃</div>
      <div><b>左键</b> 破坏</div>
      <div><b>右键</b> 放置</div>
      <div><b>1-9</b> 选物品</div>
      <div><b>滚轮</b> 切换</div>
      <div><b>点击画面</b> 锁定鼠标</div>
      <div><b>ESC</b> 释放鼠标</div>
      <div><b>C</b> 视角</div>
      <div><b>双击空格</b> 飞行</div>
      <div><b>H</b> 隐藏UI</div>
    </div>

    <!-- 可隐藏的 UI -->
    <template v-if="showUI">
      <div class="leftbar">
        <button class="chip" @click="resetPlayer">↺ 重置</button>
      </div>

      <div class="console">
        <section class="panel">
          <div class="ptitle">🌤 环境</div>
          <div class="ctrl">
            <span class="label">时刻</span>
            <input type="range" min="5" max="23" step="0.5" :value="sunHour" @input="onSunHour" />
          </div>
          <div class="ctrl">
            <span class="label">雾浓度</span>
            <input type="range" min="0" max="0.003" step="0.0001" :value="fogDensity" @input="onFog" />
          </div>
          <div class="ctrl">
            <span class="label">阴影</span>
            <label class="switch"><input type="checkbox" :checked="shadowOn" @change="setShadow($event.target.checked)" /><span class="slider"></span></label>
          </div>
          <div class="ctrl">
            <span class="label">夜间霓虹</span>
            <label class="switch"><input type="checkbox" :checked="neonOn" @change="setNeon($event.target.checked)" /><span class="slider"></span></label>
          </div>
        </section>

        <section class="panel">
          <div class="ptitle">✨ 后处理</div>
          <div class="ctrl">
            <span class="label">Bloom 泛光</span>
            <label class="switch"><input type="checkbox" :checked="bloomOn" @change="setBloom($event.target.checked)" /><span class="slider"></span></label>
          </div>
          <div class="ctrl">
            <span class="label">曝光</span>
            <input type="range" min="0.3" max="3" step="0.05" :value="exposure" @input="onExposure" />
          </div>
          <div class="ctrl">
            <span class="label">Tonemapper</span>
            <select :value="tonemapper" @change="onTonemapper">
              <option value="neutral">PBR Neutral</option>
              <option value="aces">ACES</option>
              <option value="filmic">Filmic</option>
              <option value="none">None</option>
            </select>
          </div>
        </section>

        <section class="panel">
          <div class="ptitle">📌 状态</div>
          <div class="stat row"><span>位置</span><b>({{ pos.x.toFixed(0) }}, {{ pos.y.toFixed(0) }}, {{ pos.z.toFixed(0) }})</b></div>
          <div class="stat row"><span>朝向</span><b>{{ headingText }}</b></div>
          <div class="stat row"><span>模式</span><b>{{ flying ? '✈ 飞行' : '🚶 步行' }}</b></div>
          <div class="stat row"><span>方块</span><b>{{ entities }}</b></div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, nextTick, ref } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { createNoise2D, createNoise3D } from 'simplex-noise'

const mountRef = ref(null)
let viewer = null
let lastTick = performance.now()
let fpsWindow = 0
let frameCount = 0
let lastHx = 0, lastHz = 0, lastHudT = performance.now()

const camMode = ref('first')
const flying = ref(false)
const showUI = ref(true)
const sunHour = ref(13)
const fogDensity = ref(0.0008)
const pos = ref({ x: 0, y: 0, z: 0 })
const speed = ref(0)
const entities = ref(0)
const headingText = ref('N')
const fps = ref(0)
const selectedSlot = ref(0)
const shadowOn = ref(true)
const neonOn = ref(false)
const bloomOn = ref(false)
const exposure = ref(1.2)
const tonemapper = ref('neutral')

/* ============ 方块类型与纹理图集 ============ */
const AIR = 0
const B = { GRASS: 1, DIRT: 2, STONE: 3, PLANK: 4, BRICK: 5, GLASS: 6, LOG: 7, LEAF: 8, SAND: 9, SNOW: 10, GLOW: 11 }

// 纹理图集:256×256 canvas,每种方块占 64×64 子区域(2×4 布局)
const ATLAS_SIZE = 256, TILE = 64, TILES_PER_ROW = 4
const atlasCanvas = document.createElement('canvas')
atlasCanvas.width = atlasCanvas.height = ATLAS_SIZE
const atlasCtx = atlasCanvas.getContext('2d')
const blockTexIdx = {}   // key -> 图集序号

function texCanvas(w, h, drawFn) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  drawFn(cv.getContext('2d'), w, h); return cv
}
function rand(g, n) { return Math.floor(Math.random() * n) }

function makeBlockTex(key, idx, drawFn) {
  blockTexIdx[key] = idx
  const cv = texCanvas(TILE, TILE, drawFn)
  atlasCtx.drawImage(cv, (idx % TILES_PER_ROW) * TILE, Math.floor(idx / TILES_PER_ROW) * TILE)
}

// 草地
makeBlockTex('grass', 0, (g) => {
  g.fillStyle = '#7c9c4c'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(${rand(g,40)+80},${rand(g,40)+130},${rand(g,40)+50},0.4)`; g.fillRect(rand(g,64), rand(g,64), 3, 3) }
  g.fillStyle = '#8b6914'; g.fillRect(0, 48, 64, 16)
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 48, 64, 2)
})
// 泥土
makeBlockTex('dirt', 1, (g) => {
  g.fillStyle = '#8b6914'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rand(g,40)+100},${rand(g,30)+70},${rand(g,20)+20},0.5)`; g.fillRect(rand(g,64), rand(g,64), 2, 2) }
})
// 石头
makeBlockTex('stone', 2, (g) => {
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 150; i++) { const v = rand(g,40)+90; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rand(g,64), rand(g,64), rand(g,6)+2, rand(g,6)+2) }
  for (let i = 0; i < 10; i++) { g.strokeStyle = 'rgba(0,0,0,0.2)'; g.strokeRect(rand(g,50), rand(g,50), 10, 10) }
})
// 木板
makeBlockTex('plank', 3, (g) => {
  g.fillStyle = '#bc9862'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 8; i++) { g.strokeStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.moveTo(0, i*8); g.lineTo(64, i*8); g.stroke() }
  for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.moveTo(i*21, 0); g.lineTo(i*21, 64); g.stroke() }
})
// 砖块
makeBlockTex('brick', 4, (g) => {
  g.fillStyle = '#a0403c'; g.fillRect(0, 0, 64, 64)
  for (let r = 0; r < 4; r++) {
    const off = r % 2 === 0 ? 0 : 16
    for (let c = 0; c < 3; c++) {
      g.fillStyle = `rgba(${rand(g,30)+120},${rand(g,20)+40},${rand(g,20)+40},0.4)`
      g.fillRect(c * 21 + off, r * 16, 19, 14)
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2
  for (let r = 0; r < 4; r++) { const off = r % 2 === 0 ? 0 : 16; for (let c = 0; c < 3; c++) { g.strokeRect(c * 21 + off, r * 16, 19, 14) } }
})
// 玻璃
makeBlockTex('glass', 5, (g) => {
  g.fillStyle = 'rgba(180,220,255,0.5)'; g.fillRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.strokeRect(2, 2, 60, 60)
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(4, 4, 10, 10); g.fillRect(20, 30, 8, 8)
})
// 原木
makeBlockTex('log', 6, (g) => {
  g.fillStyle = '#6b4a2f'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(${rand(g,30)+70},${rand(g,20)+45},${rand(g,15)+25},0.5)`; g.fillRect(rand(g,58), 0, rand(g,6)+2, 64) }
  for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(i*11+3, 0); g.lineTo(i*11+3, 64); g.stroke() }
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62)
})
// 树叶
makeBlockTex('leaf', 7, (g) => {
  g.fillStyle = '#2f7a35'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${rand(g,40)+30},${rand(g,50)+95},${rand(g,30)+35},0.65)`; g.fillRect(rand(g,60), rand(g,60), rand(g,7)+3, rand(g,7)+3) }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(rand(g,60), rand(g,60), 3, 3) }
})
// 沙子
makeBlockTex('sand', 8, (g) => {
  g.fillStyle = '#e3d6a3'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${rand(g,30)+200},${rand(g,25)+180},${rand(g,25)+130},0.5)`; g.fillRect(rand(g,62), rand(g,62), rand(g,3)+1, rand(g,3)+1) }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(150,130,80,0.25)'; g.fillRect(rand(g,62), rand(g,62), 2, 2) }
})
// 雪
makeBlockTex('snow', 9, (g) => {
  g.fillStyle = '#eef4fa'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 180; i++) { const v = rand(g,25)+225; g.fillStyle = `rgba(${v},${v},255,0.5)`; g.fillRect(rand(g,62), rand(g,62), rand(g,4)+1, rand(g,4)+1) }
  for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(180,200,225,0.3)'; g.fillRect(rand(g,60), rand(g,60), 3, 2) }
})
// 萤石(自发光)
makeBlockTex('glow', 10, (g) => {
  g.fillStyle = '#f0c060'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${rand(g,40)+230},${rand(g,40)+180},${rand(g,60)+90},0.8)`; g.fillRect(rand(g,58), rand(g,58), rand(g,8)+3, rand(g,8)+3) }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,220,0.9)'; g.fillRect(rand(g,60), rand(g,60), 3, 3) }
})
// 原木顶面(年轮)
makeBlockTex('log_top', 12, (g) => {
  g.fillStyle = '#8a6a44'; g.fillRect(0, 0, 64, 64)
  for (let r = 30; r > 3; r -= 5) {
    g.strokeStyle = `rgba(${rand(g,30)+80},${rand(g,25)+55},${rand(g,20)+30},0.7)`
    g.lineWidth = 2; g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke()
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(1, 1, 62, 62)
})

// 体素 ID → 图集序号(与 B 对应)
const BLOCK_TEX = { [B.GRASS]: blockTexIdx.grass, [B.DIRT]: blockTexIdx.dirt, [B.STONE]: blockTexIdx.stone, [B.PLANK]: blockTexIdx.plank, [B.BRICK]: blockTexIdx.brick, [B.GLASS]: blockTexIdx.glass, [B.LOG]: blockTexIdx.log, [B.LEAF]: blockTexIdx.leaf, [B.SAND]: blockTexIdx.sand, [B.SNOW]: blockTexIdx.snow, [B.GLOW]: blockTexIdx.glow }
const LOG_TOP_TEX = blockTexIdx.log_top
// 按面取纹理(原木顶/底面用年轮)
function faceTexFor(id, faceIdx) {
  if (id === B.LOG && faceIdx <= 1) return LOG_TOP_TEX
  return BLOCK_TEX[id]
}

const blockTypes = [
  { key: 'grass', color: '#7c9c4c', name: '草地' },
  { key: 'dirt', color: '#8b6914', name: '泥土' },
  { key: 'stone', color: '#7a7a7a', name: '石头' },
  { key: 'plank', color: '#bc9862', name: '木板' },
  { key: 'brick', color: '#a0403c', name: '砖块' },
  { key: 'glass', color: 'rgba(180,220,255,0.6)', name: '玻璃' },
  { key: 'log', color: '#6b4a2f', name: '原木' },
  { key: 'leaf', color: '#2f7a35', name: '树叶' },
  { key: 'sand', color: '#e3d6a3', name: '沙子' },
  { key: 'snow', color: '#eef4fa', name: '雪' },
  { key: 'glow', color: '#f0c060', name: '萤石' },
  { key: 'ball', color: '#ffe16b', name: '光球' },
]
const blockIdByKey = { grass: B.GRASS, dirt: B.DIRT, stone: B.STONE, plank: B.PLANK, brick: B.BRICK, glass: B.GLASS, log: B.LOG, leaf: B.LEAF, sand: B.SAND, snow: B.SNOW, glow: B.GLOW }
const BALL_SLOT = 11
function currentBlockId() { return blockIdByKey[blockTypes[selectedSlot.value].key] || 0 }

/* ============ 本地世界坐标 ============ */
const ORIGIN = Cesium.Cartesian3.fromDegrees(116.3983, 39.9135)
const ENU = Cesium.Transforms.eastNorthUpToFixedFrame(ORIGIN)
const ENU_INV = Cesium.Matrix4.inverse(ENU, new Cesium.Matrix4())
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }
function wpos(x, y, z) {
  const cosLat = Math.cos(39.9135 * Math.PI / 180)
  return Cesium.Cartesian3.fromDegrees(116.3983 + x / (111320 * cosLat), 39.9135 + z / 110542, y)
}
// 局部矩形 → 经纬度 Rectangle(云层用)
function rectFromLocal(x0, z0, x1, z1) {
  const cosLat = Math.cos(39.9135 * Math.PI / 180)
  return Cesium.Rectangle.fromDegrees(
    116.3983 + x0 / (111320 * cosLat), 39.9135 + z0 / 110542,
    116.3983 + x1 / (111320 * cosLat), 39.9135 + z1 / 110542)
}

// 调试用:ECEF → 体素局部坐标(x=east, y=up, z=north)
function ecefToVoxel(cartesian) {
  const l = Cesium.Matrix4.multiplyByPoint(ENU_INV, cartesian, new Cesium.Cartesian3())
  return { x: l.x, y: l.z, z: l.y }
}

/* ============ 体素世界(Chunk 数据层) ============ */
// 本地坐标约定: x=east, y=up, z=north;格点坐标 = 世界坐标 floor
const VOX_W = 16, VOX_H = 256, VOX_D = 16     // chunk 尺寸(高度 256,深度充足)
const WORLD_HALF = 128                          // 世界 256×256 (±128)
const chunks = new Map()                       // chunkKey -> Uint8Array(16*48*16)
const chunkTop = new Map()                     // chunkKey -> 最高实心体素 y(加速查询/网格化)
const chunkPrimitives = new Map()              // chunkKey -> { opaque, glass }
const chunkKeyOf = (cx, cz) => cx + ',' + cz

function voxelIndex(lx, y, lz) { return (y * VOX_W + lx) * VOX_D + lz }
function voxelAt(x, y, z) {
  if (y < 0 || y >= VOX_H || x < -WORLD_HALF || x >= WORLD_HALF || z < -WORLD_HALF || z >= WORLD_HALF) return AIR
  const cx = Math.floor(x / VOX_W), cz = Math.floor(z / VOX_D)
  const arr = chunks.get(chunkKeyOf(cx, cz))
  if (!arr) return AIR
  return arr[voxelIndex(x - cx * VOX_W, y, z - cz * VOX_D)]
}
function setVoxelRaw(x, y, z, id) {
  if (y < 0 || y >= VOX_H || x < -WORLD_HALF || x >= WORLD_HALF || z < -WORLD_HALF || z >= WORLD_HALF) return false
  const cx = Math.floor(x / VOX_W), cz = Math.floor(z / VOX_D)
  const key = chunkKeyOf(cx, cz)
  let arr = chunks.get(key)
  if (!arr) { arr = new Uint8Array(VOX_W * VOX_H * VOX_D); chunks.set(key, arr) }
  arr[voxelIndex(x - cx * VOX_W, y, z - cz * VOX_D)] = id
  if (id) { const t = chunkTop.get(key) || 0; if (y > t) chunkTop.set(key, y) }
  return true
}
// 是否遮挡相邻面(玻璃/水半透明,不遮挡;但同种方块互剔)
function isOpaque(id) { return id !== AIR && id !== B.GLASS }
const isTranslucentId = (id) => id === B.GLASS

/* ============ 地形生成(simplex 噪声) ============ */
const noise2D = createNoise2D(() => 0.618033988749895) // 固定种子,地形可复现
const noise3D = createNoise3D(() => 0.3141592653589793)

/* ---- fBm 分形叠加(参考 MC 1.18 世界生成:多倍频噪声) ---- */
function fbm2(x, z, oct, freq, gain, lac) {
  let sum = 0, amp = 1, f = freq, norm = 0
  for (let i = 0; i < oct; i++) { sum += noise2D(x * f, z * f) * amp; norm += amp; amp *= gain; f *= lac }
  return sum / norm
}
function fbm3(x, y, z, oct, freq, gain, lac) {
  let sum = 0, amp = 1, f = freq, norm = 0
  for (let i = 0; i < oct; i++) { sum += noise3D(x * f, y * f, z * f) * amp; norm += amp; amp *= gain; f *= lac }
  return sum / norm
}

/* ---- 地表高度:大陆度 + 侵蚀 + 山峰谷地 + 山脊线 ---- */
const BASE_Y = 64
function surfaceYAt(x, z) {
  const cont = fbm2(x, z, 4, 1 / 190, 0.5, 2)                 // 大陆度(大尺度)
  const ero = fbm2(x + 1000, z - 1000, 3, 1 / 95, 0.5, 2)     // 侵蚀(平坦度)
  const pv = fbm2(x - 500, z + 500, 3, 1 / 52, 0.5, 2)        // 山峰谷地
  const ridgeN = 1 - Math.abs(fbm2(x + 800, z + 800, 3, 1 / 68, 0.5, 2)) // 山脊线
  let h = BASE_Y + cont * 24 + pv * 16
  h += ridgeN * ridgeN * 44 * Math.max(0, 1 - (ero * 0.5 + 0.5) * 1.15)
  return clamp(Math.round(h), 26, 150)
}
function groundYAt(x, z) { return surfaceYAt(x, z) }

/* ---- 3D 密度:决定实/空,产生悬崖与洞穴(MC 式) ---- */
function densityAt(x, y, z, sy) {
  const base = (sy - y) / 9
  const n = fbm3(x, y * 2.2, z, 3, 1 / 42, 0.5, 2)
  return base + n * 1.9
}

/* ---- 洞穴:意面隧道(双噪声近零) + 奶酪洞厅(单噪声阈值) ---- */
function caveAt(x, y, z) {
  const s1 = noise3D(x / 34, y / 26, z / 34)
  const s2 = noise3D(x / 34 + 700, y / 26 + 300, z / 34 - 700)
  if (Math.abs(s1) < 0.075 && Math.abs(s2) < 0.075) return true
  const c = noise3D(x / 58 - 900, y / 44 + 900, z / 58 + 900)
  return c > 0.46
}

function genTerrain() {
  const spawnY = surfaceYAt(0, 0)   // 出生点高度取中心地形,避免陷在坑里
  for (let x = -WORLD_HALF; x < WORLD_HALF; x++) {
    for (let z = -WORLD_HALF; z < WORLD_HALF; z++) {
      const spawnFlat = Math.abs(x) <= 10 && Math.abs(z) <= 10
      const sy = spawnFlat ? spawnY : surfaceYAt(x, z)
      const top = Math.min(VOX_H - 1, sy + 14)
      for (let y = 0; y <= top; y++) {
        let solid
        if (y <= 2) solid = true                              // 基岩层
        else if (y < sy - 12) solid = true                    // 深处必实
        else if (y > sy + 12) solid = false
        else solid = densityAt(x, y, z, sy) > 0               // 表层 3D 密度(悬崖/洞顶)
        // 挖洞穴(避开基岩与地表表层)
        if (solid && y >= 5 && y <= sy - 7 && caveAt(x, y, z)) solid = false
        if (solid) {
          let id
          if (y >= sy - 1) id = B.GRASS
          else if (y >= sy - 4) id = B.DIRT
          else id = B.STONE
          setVoxelRaw(x, y, z, id)
        }
      }
      // 少量地表裂口(洞穴入口/峡谷),避开出生区
      if (!spawnFlat && Math.abs(x) > 14 && Math.abs(z) > 14) {
        const e1 = noise2D(x / 13 + 31, z / 13 + 31), e2 = noise2D(x / 13 + 63, z / 13 + 63)
        if (e1 * e1 + e2 * e2 < 0.0016) {
          for (let y = 5; y <= sy; y++) setVoxelRaw(x, y, z, AIR)
        }
      }
    }
  }
}

/* ============ Chunk 网格生成(Meshing) ============ */
// 面定义:dir=法线方向,corners=面四角(从面外看逆时针),便于背面剔除
// 面定义:dir=体素空间方向(用于邻接判定),n=ENU空间法线,corners=ENU空间四角(E,N,U)
// 几何顶点必须用右手系 ENU(东,北,上) —— 左手系(east,up,north)会被烘焙进顶点时翻转绕序导致背面剔除错乱
const FACES = [
  { dir: [0, 1, 0],  n: [0, 0, 1],  corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },   // top    (体素+y = ENU+U)
  { dir: [0, -1, 0], n: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },   // bottom
  { dir: [1, 0, 0],  n: [1, 0, 0],  corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },   // +x     (体素+x = ENU+E)
  { dir: [-1, 0, 0], n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },   // -x
  { dir: [0, 0, 1],  n: [0, 1, 0],  corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },   // +z     (体素+z = ENU+N)
  { dir: [0, 0, -1], n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },   // -z
]
// 每面 UV 四角(图集子区域)
function faceUVs(ti) {
  const u0 = (ti % TILES_PER_ROW) / TILES_PER_ROW
  const v1 = 1 - Math.floor(ti / TILES_PER_ROW) / TILES_PER_ROW  // canvas y 向下,v 向上翻转
  const u1 = u0 + 1 / TILES_PER_ROW, v0 = v1 - 1 / TILES_PER_ROW
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
}

// 构建 chunk 的两个 geometry:不透明 + 玻璃(半透明)
function buildChunkGeometries(cx, cz) {
  const ox = cx * VOX_W, oz = cz * VOX_D
  const opaque = { pos: [], nor: [], uv: [], idx: [] }
  const glass = { pos: [], nor: [], uv: [], idx: [] }   // 半透明层(玻璃 + 水)
  const arr = chunks.get(chunkKeyOf(cx, cz))
  if (!arr) return null
  const topY = Math.min(VOX_H - 1, chunkTop.get(chunkKeyOf(cx, cz)) ?? VOX_H - 1)
  for (let ly = 0; ly <= topY; ly++) for (let lx = 0; lx < VOX_W; lx++) for (let lz = 0; lz < VOX_D; lz++) {
    const id = arr[voxelIndex(lx, ly, lz)]
    if (!id) continue
    const wx = ox + lx, wy = ly, wz = oz + lz
    const translucent = isTranslucentId(id)
    const target = translucent ? glass : opaque
    for (let fi = 0; fi < FACES.length; fi++) {
      const f = FACES[fi]
      const nb = voxelAt(wx + f.dir[0], wy + f.dir[1], wz + f.dir[2])
      // 剔除:半透明方块仅与同种方块互剔;不透明方块被不透明邻块遮挡
      const hidden = translucent ? (nb === id) : isOpaque(nb)
      if (hidden) continue
      const ti = faceTexFor(id, fi)
      if (ti === undefined) continue
      const base = target.pos.length / 3
      const uvs = faceUVs(ti)
      for (let ci = 0; ci < 4; ci++) {
        const c = f.corners[ci]
        target.pos.push(wx + c[0], wz + c[1], wy + c[2])   // 体素(x=east,y=up,z=north) → ENU(E,N,U)
        target.nor.push(f.n[0], f.n[1], f.n[2])
        target.uv.push(uvs[ci][0], uvs[ci][1])
      }
      target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const mk = (d) => {
    if (!d.pos.length) return null
    return new Cesium.Geometry({
      attributes: {
        position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: d.pos }),
        normal: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: d.nor }),
        st: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: d.uv }),
      },
      indices: new Uint32Array(d.idx),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(d.pos),
    })
  }
  return { opaque: mk(opaque), glass: mk(glass) }
}

// 局部 ENU(东,北,上) → ECEF 的变换矩阵(右手系,与 Cesium eastNorthUpToFixedFrame 一致)
let WORLD_MATRIX = null
function computeWorldMatrix() {
  WORLD_MATRIX = ENU
}

let chunkAppearance = null, glassAppearance = null
const MAX_LIGHTS = 8
const lightUniformSets = []   // 每个 appearance 一套 uniform

/* 体素着色器:太阳光用场景光源自动 uniform,萤石用同一 Lambert 模型的点光源 */
const VOXEL_VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in float batchId;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec2 v_st;

void main()
{
    vec4 p = czm_computePosition();
    v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
    v_normalEC = czm_normal * normal;
    v_st = st;
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`
const VOXEL_FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;

uniform vec3 u_lp0; uniform vec3 u_lc0;
uniform vec3 u_lp1; uniform vec3 u_lc1;
uniform vec3 u_lp2; uniform vec3 u_lc2;
uniform vec3 u_lp3; uniform vec3 u_lc3;
uniform vec3 u_lp4; uniform vec3 u_lc4;
uniform vec3 u_lp5; uniform vec3 u_lc5;
uniform vec3 u_lp6; uniform vec3 u_lc6;
uniform vec3 u_lp7; uniform vec3 u_lc7;

// 点光源:与太阳同一套 Lambert 模型(N·L)+ 距离衰减
vec3 pointLight(vec3 lp, vec3 lc, vec3 n, vec3 pos)
{
    vec3 d = lp - pos;
    float dist = length(d);
    float att = clamp(1.0 - dist / 18.0, 0.0, 1.0);
    att *= att;
    float ndl = max(dot(n, d / max(dist, 0.0001)), 0.0);
    return lc * att * (ndl * 0.72 + 0.28);
}

void main()
{
    vec3 normalEC = normalize(v_normalEC);

    czm_materialInput materialInput;
    materialInput.normalEC = normalEC;
    materialInput.positionToEyeEC = -v_positionEC;
    materialInput.st = v_st;
    czm_material material = czm_getMaterial(materialInput);

    vec3 albedo = material.diffuse;
    // 环境光(与 czm_phong 一致)
    vec3 color = albedo * 0.5;
    // 太阳:场景光源(与角色/实体同一套)
    color += albedo * czm_lightColor * max(dot(normalEC, czm_lightDirectionEC), 0.0);
    // 萤石点光源
    color += albedo * pointLight(u_lp0, u_lc0, normalEC, v_positionEC);
    color += albedo * pointLight(u_lp1, u_lc1, normalEC, v_positionEC);
    color += albedo * pointLight(u_lp2, u_lc2, normalEC, v_positionEC);
    color += albedo * pointLight(u_lp3, u_lc3, normalEC, v_positionEC);
    color += albedo * pointLight(u_lp4, u_lc4, normalEC, v_positionEC);
    color += albedo * pointLight(u_lp5, u_lc5, normalEC, v_positionEC);
    color += albedo * pointLight(u_lp6, u_lc6, normalEC, v_positionEC);
    color += albedo * pointLight(u_lp7, u_lc7, normalEC, v_positionEC);

    out_FragColor = vec4(color, material.alpha);
}
`

function initChunkRendering() {
  computeWorldMatrix()
  const makeApp = (translucent) => {
    const app = new Cesium.Appearance({
      material: Cesium.Material.fromType('Image', { image: atlasCanvas }),
      vertexShaderSource: VOXEL_VS,
      fragmentShaderSource: VOXEL_FS,
      vertexFormat: Cesium.VertexFormat.POSITION_NORMAL_AND_ST,
      translucent,
      renderState: { depthTest: { enabled: true }, cull: { enabled: true, face: Cesium.CullFace.BACK } },
    })
    const u = {}
    for (let i = 0; i < MAX_LIGHTS; i++) {
      u['u_lp' + i] = Cesium.Cartesian3.ZERO
      u['u_lc' + i] = Cesium.Cartesian3.ZERO
    }
    app.uniforms = u
    lightUniformSets.push(u)
    return app
  }
  chunkAppearance = makeApp(false)
  glassAppearance = makeApp(true)
}

/* 每帧更新点光源眼空间位置(取离相机最近的 MAX_LIGHTS 个萤石) */
const scratchLightWorld = new Cesium.Cartesian3()
const scratchLightEC = new Cesium.Cartesian3()
function updateLightUniforms() {
  if (!viewer || !lightUniformSets.length) return
  const cam = viewer.camera
  const camLocal = Cesium.Matrix4.multiplyByPoint(ENU_INV, cam.positionWC, new Cesium.Cartesian3())
  // 局部坐标排序取最近(注意 ENU_INV 返回 x=east,y=north,z=up,而体素是 y=up,z=north)
  const list = [...glowLights.values()]
  if (list.length > 1) {
    list.sort((a, b) => {
      const da = (a.x - camLocal.x) ** 2 + (a.y - camLocal.z) ** 2 + (a.z - camLocal.y) ** 2
      const db = (b.x - camLocal.x) ** 2 + (b.y - camLocal.z) ** 2 + (b.z - camLocal.y) ** 2
      return da - db
    })
  }
  // 夜间自动提亮(补偿曝光压低),白天用基础强度
  const t = ((sunHour.value - 6) / 12) * Math.PI
  const dayF = clamp(0.15 + 0.85 * Math.max(0, Math.sin(t)), 0.15, 1)
  const intensity = Math.min(18, 2.4 / dayF)
  const viewMatrix = cam.viewMatrix
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const L = i < list.length ? list[i] : null
    let lp = Cesium.Cartesian3.ZERO, lc = Cesium.Cartesian3.ZERO
    if (L) {
      Cesium.Matrix4.multiplyByPoint(WORLD_MATRIX, new Cesium.Cartesian3(L.x + 0.5, L.z + 0.5, L.y + 0.5), scratchLightWorld)
      lp = Cesium.Matrix4.multiplyByPoint(viewMatrix, scratchLightWorld, scratchLightEC)
      lc = new Cesium.Cartesian3(intensity, intensity * 0.98, intensity * 0.92) // 微暖白
    }
    for (const u of lightUniformSets) {
      u['u_lp' + i] = lp
      u['u_lc' + i] = lc
    }
  }
}

function rebuildChunk(cx, cz) {
  const key = chunkKeyOf(cx, cz)
  const old = chunkPrimitives.get(key)
  if (old) {
    if (old.opaque) viewer.scene.primitives.remove(old.opaque)
    if (old.glass) viewer.scene.primitives.remove(old.glass)
    chunkPrimitives.delete(key)
  }
  const geos = buildChunkGeometries(cx, cz)
  if (!geos) return
  const rec = { opaque: null, glass: null }
  const mkPrim = (geo, appearance, translucency) => {
    if (!geo) return null
    const prim = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({ geometry: geo, modelMatrix: WORLD_MATRIX }),
      appearance, asynchronous: false,
      shadows: Cesium.ShadowMode.ENABLED,
    })
    viewer.scene.primitives.add(prim)
    return prim
  }
  rec.opaque = mkPrim(geos.opaque, chunkAppearance, false)
  rec.glass = mkPrim(geos.glass, glassAppearance, true)
  chunkPrimitives.set(key, rec)
}

function rebuildChunkAt(x, z) {
  const cx = Math.floor(x / VOX_W), cz = Math.floor(z / VOX_D)
  rebuildChunk(cx, cz)
  // 边界方块影响邻接 chunk 的面剔除
  const lx = x - cx * VOX_W, lz = z - cz * VOX_D
  if (lx === 0) rebuildChunk(cx - 1, cz)
  if (lx === VOX_W - 1) rebuildChunk(cx + 1, cz)
  if (lz === 0) rebuildChunk(cx, cz - 1)
  if (lz === VOX_D - 1) rebuildChunk(cx, cz + 1)
}

function buildAllChunks() {
  const c0 = Math.floor(-WORLD_HALF / VOX_W), c1 = Math.ceil(WORLD_HALF / VOX_W)
  for (let cx = c0; cx < c1; cx++) for (let cz = c0; cz < c1; cz++) rebuildChunk(cx, cz)
}

/* ============ 玩家 ============ */
const player = { x: 0, z: 0, y: 1.1, vy: 0, yaw: 0, camPitch: -0.05, radius: 0.3, height: 1.7 }
let playerBody = null, playerHead = null, playerNose = null
const ballObjs = []
const charParts = []
let placedCount = 0

let mouseLastX = 0, mouseLastY = 0
const GRAVITY = -19.6
const WALK = 5.2, SPRINT = 8.4, JUMP_V = 8.8
const FLY_SPEED = 10.5, FLY_SPRINT = 19, FLY_VERT = 7.5
let jumpLock = false
let lastSpaceTap = 0
let stepAccum = 0

/* ============ 世界搭建 ============ */
function addVoxelTree(x, z) {
  const gy = voxelGroundY(x, z)
  const h = 3 + Math.floor(Math.random() * 2)
  for (let y = gy; y < gy + h; y++) setVoxelRaw(x, y, z, B.LOG)
  const top = gy + h
  // 树叶:十字+顶层
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) + Math.abs(dz) > 3) continue
    for (let dy = 0; dy <= 1; dy++) {
      if (dx === 0 && dz === 0 && dy === 0) continue
      if (!voxelAt(x + dx, top + dy, z + dz)) setVoxelRaw(x + dx, top + dy, z + dz, B.LEAF)
    }
  }
  setVoxelRaw(x, top + 1, z, B.LEAF)
}

function buildWorld() {
  genTerrain()
  // 树木(避开出生平整区)
  let seed = 7
  const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647 }
  let made = 0, guard = 0
  while (made < 22 && guard++ < 300) {
    const x = Math.round(rnd() * 104 - 52), z = Math.round(rnd() * 104 - 52)
    if (Math.abs(x) < 14 && Math.abs(z) < 14) continue
    if (voxelAt(x, voxelGroundY(x, z) - 1, z) !== B.GRASS) continue
    addVoxelTree(x, z)
    made++
  }
}

/* ============ 角色 ============ */
function buildCharacter() {
  const skin = Cesium.Color.fromCssColorString('#ffcc99')
  const shirt = Cesium.Color.fromCssColorString('#4488cc')
  const pants = Cesium.Color.fromCssColorString('#333355')
  const shoe = Cesium.Color.fromCssColorString('#222222')
  const hair = Cesium.Color.fromCssColorString('#553322')
  const add = (posFn, geom) => { const e = viewer.entities.add({ position: new Cesium.CallbackProperty(posFn, false), ...geom }); charParts.push(e) }
  const p = () => player
  add(() => wpos(p().x, p().y + 1.1, p().z), { box: { dimensions: new Cesium.Cartesian3(0.4, 0.3, 0.6), material: shirt, shadows: Cesium.ShadowMode.ENABLED } })
  add(() => wpos(p().x, p().y + 1.65, p().z), { ellipsoid: { radii: new Cesium.Cartesian3(0.2, 0.2, 0.22), material: skin, shadows: Cesium.ShadowMode.ENABLED } })
  add(() => wpos(p().x, p().y + 1.78, p().z), { ellipsoid: { radii: new Cesium.Cartesian3(0.2, 0.2, 0.1), material: hair } })
  add(() => wpos(p().x - 0.12, p().y + 0.35, p().z), { cylinder: { length: 0.7, topRadius: 0.08, bottomRadius: 0.1, material: pants, shadows: Cesium.ShadowMode.ENABLED } })
  add(() => wpos(p().x + 0.12, p().y + 0.35, p().z), { cylinder: { length: 0.7, topRadius: 0.08, bottomRadius: 0.1, material: pants, shadows: Cesium.ShadowMode.ENABLED } })
  add(() => wpos(p().x - 0.28, p().y + 1.2, p().z), { cylinder: { length: 0.6, topRadius: 0.06, bottomRadius: 0.07, material: skin, shadows: Cesium.ShadowMode.ENABLED } })
  add(() => wpos(p().x + 0.28, p().y + 1.2, p().z), { cylinder: { length: 0.6, topRadius: 0.06, bottomRadius: 0.07, material: skin, shadows: Cesium.ShadowMode.ENABLED } })
  add(() => wpos(p().x - 0.12, p().y + 0.05, p().z), { box: { dimensions: new Cesium.Cartesian3(0.15, 0.1, 0.2), material: shoe } })
  add(() => wpos(p().x + 0.12, p().y + 0.05, p().z), { box: { dimensions: new Cesium.Cartesian3(0.15, 0.1, 0.2), material: shoe } })
  playerBody = charParts[0]; playerHead = charParts[1]; playerNose = charParts[2]
}

/* ============ 地面高度与碰撞(体素) ============ */
// 从玩家脚下向下扫第一个实心格(悬空桥/天花板场景正确)
function groundHeight(x, z) {
  const bx = Math.floor(x), bz = Math.floor(z)
  const startY = Math.min(VOX_H - 1, Math.floor(player.y + 0.001))
  for (let y = startY; y >= 0; y--) if (voxelAt(bx, y, bz)) return y + 1
  return 0
}
function voxelGroundY(x, z) {
  const bx = Math.floor(x), bz = Math.floor(z)
  const cx = Math.floor(bx / VOX_W), cz = Math.floor(bz / VOX_D)
  const top = Math.min(VOX_H - 1, chunkTop.get(chunkKeyOf(cx, cz)) ?? VOX_H - 1)
  for (let y = top; y >= 0; y--) if (voxelAt(bx, y, bz)) return y + 1
  return 0
}
// 玩家 AABB(x±radius, y..y+height, z±radius) 是否与某体素格相交
function playerIntersectsVoxel(bx, by, bz) {
  return player.x - player.radius < bx + 1 && player.x + player.radius > bx &&
         player.y < by + 1 && player.y + player.height > by &&
         player.z - player.radius < bz + 1 && player.z + player.radius > bz
}
// 体素侧向/垂直碰撞推出(最小穿透轴)
function collideVoxels() {
  const minX = Math.floor(player.x - player.radius), maxX = Math.floor(player.x + player.radius)
  const minZ = Math.floor(player.z - player.radius), maxZ = Math.floor(player.z + player.radius)
  const minY = Math.floor(player.y + 0.001), maxY = Math.floor(player.y + player.height)
  for (let bx = minX; bx <= maxX; bx++) for (let bz = minZ; bz <= maxZ; bz++) for (let by = minY; by <= maxY; by++) {
    if (!voxelAt(bx, by, bz)) continue
    const px = Math.min(player.x + player.radius - bx, bx + 1 - (player.x - player.radius))
    const pz = Math.min(player.z + player.radius - bz, bz + 1 - (player.z - player.radius))
    const py = Math.min(player.y + player.height - by, by + 1 - player.y)
    if (py <= px && py <= pz) {
      if (player.y + player.height / 2 < by + 0.5) { player.y = by - player.height; player.vy = Math.min(player.vy, 0) }
      else { player.y = by + 1; player.vy = Math.max(player.vy, 0) }
    } else if (px < pz) {
      player.x = (player.x < bx + 0.5) ? bx - player.radius : bx + 1 + player.radius
    } else {
      player.z = (player.z < bz + 0.5) ? bz - player.radius : bz + 1 + player.radius
    }
  }
}

/* ============ 光球 ============ */
const BALL_MAX = 30
function throwBall() {
  if (ballObjs.length >= BALL_MAX) {
    const old = ballObjs.shift()
    viewer.entities.remove(old.e)
  }
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw)
  const pitchK = -player.camPitch * 8
  const b = {
    x: player.x + fx * 0.8, y: player.y + 1.5, z: player.z + fz * 0.8,
    vx: fx * 13, vy: 5.5 + pitchK, vz: fz * 13, e: null,
  }
  b.e = viewer.entities.add({
    position: new Cesium.CallbackProperty(() => wpos(b.x, b.y, b.z), false),
    ellipsoid: { radii: new Cesium.Cartesian3(0.22, 0.22, 0.22), material: Cesium.Color.fromCssColorString('#ffe16b'), shadows: Cesium.ShadowMode.DISABLED },
  })
  ballObjs.push(b)
}
function updateBalls(dt) {
  for (const b of ballObjs) {
    b.vy += GRAVITY * dt
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt
    const gy = voxelGroundY(b.x, b.z)
    if (b.y < gy + 0.22) { b.y = gy + 0.22; b.vy = Math.abs(b.vy) * 0.55 }
    if (Math.abs(b.x) > WORLD_HALF - 2) { b.vx = -b.vx * 0.6; b.x = clamp(b.x, -WORLD_HALF + 2, WORLD_HALF - 2) }
    if (Math.abs(b.z) > WORLD_HALF - 2) { b.vz = -b.vz * 0.6; b.z = clamp(b.z, -WORLD_HALF + 2, WORLD_HALF - 2) }
  }
}

/* ============ 交互(体素射线) ============ */
// DDA 体素射线(Amanatides & Woo):返回 {hit:[x,y,z], place:[x,y,z]} 或 null
function raycastVoxel(maxDist) {
  // 射线起点固定在玩家眼位(第三人称相机在身后 10m,用相机位置会导致射线够不到方块)
  const camPos = new Cesium.Cartesian3(player.x, player.y + 1.62, player.z)
  const dirECEF = Cesium.Cartesian3.normalize(viewer.camera.directionWC, new Cesium.Cartesian3())
  const dl = Cesium.Matrix4.multiplyByPointAsVector(ENU_INV, dirECEF, new Cesium.Cartesian3())
  const dir = new Cesium.Cartesian3(dl.x, dl.z, dl.y)
  let x = Math.floor(camPos.x), y = Math.floor(camPos.y), z = Math.floor(camPos.z)
  const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z)
  const tDeltaX = Math.abs(1 / (dir.x || 1e-10)), tDeltaY = Math.abs(1 / (dir.y || 1e-10)), tDeltaZ = Math.abs(1 / (dir.z || 1e-10))
  let tMaxX = tDeltaX * (stepX > 0 ? (x + 1 - camPos.x) : (camPos.x - x))
  let tMaxY = tDeltaY * (stepY > 0 ? (y + 1 - camPos.y) : (camPos.y - y))
  let tMaxZ = tDeltaZ * (stepZ > 0 ? (z + 1 - camPos.z) : (camPos.z - z))
  let place = null, t = 0
  for (let i = 0; i < 128 && t <= maxDist; i++) {
    const id = voxelAt(x, y, z)
    if (id) return { hit: [x, y, z], place }
    place = [x, y, z]
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ }
    if (y < -1 || y > VOX_H + 1) break
  }
  return null
}

/* ============ 沙子重力 ============ */
// 从 fromY 向下扫描该列,悬空的沙子落到支撑面
function settleColumn(x, z, fromY) {
  for (let y = Math.min(fromY, VOX_H - 1); y > 0; y--) {
    if (voxelAt(x, y, z) !== B.SAND) continue
    let cy = y
    while (cy > 0 && voxelAt(x, cy - 1, z) === AIR) cy--
    if (cy !== y) {
      setVoxelRaw(x, y, z, AIR)
      setVoxelRaw(x, cy, z, B.SAND)
    }
  }
}

/* ============ 萤石光源(真实点光源:着色器逐像素计算,此处只维护注册表) ============ */
const glowLights = new Map()   // "x,y,z" -> {x,y,z} 局部坐标
let glowCoreTex = null
function getGlowCoreTex() {
  if (glowCoreTex) return glowCoreTex
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const g = cv.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(255,250,225,0.9)')
  grad.addColorStop(0.5, 'rgba(255,238,180,0.35)')
  grad.addColorStop(1, 'rgba(255,230,160,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  glowCoreTex = cv
  return cv
}
function addGlowHalo(x, y, z) {
  const key = x + ',' + y + ',' + z
  if (glowLights.has(key)) return
  glowLights.set(key, { x, y, z })
  // 仅萤石本体上的小光斑(2m),真正的照明由体素着色器的点光源完成
  const e = viewer.entities.add({
    position: wpos(x + 0.5, y + 0.5, z + 0.5),
    billboard: {
      image: getGlowCoreTex(),
      width: 2.2, height: 2.2, sizeInMeters: true,
      color: Cesium.Color.WHITE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      blending: Cesium.BlendingState.ADDITIVE_BLEND,
    },
  })
  glowLights.get(key).sprite = e
  updateLightUniforms()
}
function removeGlowHalo(x, y, z) {
  const key = x + ',' + y + ',' + z
  const L = glowLights.get(key)
  if (L) {
    if (L.sprite) viewer.entities.remove(L.sprite)
    glowLights.delete(key)
    updateLightUniforms()
  }
}

const MAX_REACH = 5.5
function placeBlockVoxel(x, y, z, id) {
  if (!setVoxelRaw(x, y, z, id)) return
  placedCount++
  sfxPlace()
  if (id === B.GLOW) addGlowHalo(x, y, z)
  rebuildChunkAt(x, z)
  if (id === B.SAND) { settleColumn(x, z, y); rebuildChunkAt(x, z) }
}
function destroyBlock() {
  if (!viewer) return
  const ray = raycastVoxel(MAX_REACH)
  if (!ray) return
  const [x, y, z] = ray.hit
  const oldId = voxelAt(x, y, z)
  if (!setVoxelRaw(x, y, z, AIR)) return
  sfxBreak()
  if (oldId === B.GLOW) removeGlowHalo(x, y, z)
  rebuildChunkAt(x, z)
  // 上方沙子落下
  settleColumn(x, z, y + 1); rebuildChunkAt(x, z)
}
function placeAtClick() {
  if (!viewer) return
  if (selectedSlot.value === BALL_SLOT) { throwBall(); return } // 光球格: 右键扔球
  const ray = raycastVoxel(MAX_REACH)
  if (!ray || !ray.place) return
  const [x, y, z] = ray.place
  if (Math.abs(x) >= WORLD_HALF - 1 || Math.abs(z) >= WORLD_HALF - 1 || y < 0 || y >= VOX_H) return
  if (voxelAt(x, y, z)) return
  if (playerIntersectsVoxel(x, y, z)) return // 不能把方块放进自己身体
  placeBlockVoxel(x, y, z, currentBlockId())
}

/* ============ 物理 ============ */
function updatePlayer(dt) {
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0
  const back = (keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : 0
  const left = (keys.has('KeyA') || keys.has('ArrowLeft')) ? 1 : 0
  const right = (keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
  const spd = flying.value ? (sprint ? FLY_SPRINT : FLY_SPEED) : (sprint ? SPRINT : WALK)
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw)
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw)
  let mx = (fwd - back) * fx + (right - left) * rx
  let mz = (fwd - back) * fz + (right - left) * rz
  const mlen = Math.hypot(mx, mz)
  if (mlen > 0) { player.x += (mx / mlen) * spd * dt; player.z += (mz / mlen) * spd * dt }
  // 脚步声:移动且贴地时按距离触发
  if (mlen > 0 && !flying.value) {
    stepAccum += Math.hypot(mx, mz) * spd * dt
    if (stepAccum > 2.1) { stepAccum = 0; sfxStep() }
  }

  if (flying.value) {
    // 创造模式飞行:无重力,空格上升 / Shift 下降
    let vy = 0
    if (keys.has('Space')) vy += FLY_VERT
    if (sprint) vy -= FLY_VERT
    player.vy = 0
    player.y += vy * dt
    player.y = clamp(player.y, 1, VOX_H - 2)
    collideVoxels()
    player.x = clamp(player.x, -WORLD_HALF + 1, WORLD_HALF - 1); player.z = clamp(player.z, -WORLD_HALF + 1, WORLD_HALF - 1)
    return
  }

  if (keys.has('Space')) {
    if (!jumpLock && player.y <= groundHeight(player.x, player.z) + 0.05) { player.vy = JUMP_V; jumpLock = true }
  } else jumpLock = false
  player.vy += GRAVITY * dt; player.y += player.vy * dt
  const gy = groundHeight(player.x, player.z)
  if (player.y <= gy) { player.y = gy; if (player.vy < -18) player.vy = -0.6; else player.vy = 0 }
  collideVoxels()
  player.x = clamp(player.x, -WORLD_HALF + 1, WORLD_HALF - 1); player.z = clamp(player.z, -WORLD_HALF + 1, WORLD_HALF - 1)
}

/* ============ 相机 ============ */
function updateCamera() {
  const c = viewer.camera; const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw)
  if (camMode.value === 'third') {
    c.setView({ destination: wpos(player.x - fx * 10, player.y + 5.5, player.z - fz * 10), orientation: { heading: player.yaw, pitch: -0.41 + player.camPitch * 0.3, roll: 0 } })
  } else {
    c.setView({ destination: wpos(player.x, player.y + 1.62, player.z), orientation: { heading: player.yaw, pitch: player.camPitch, roll: 0 } })
  }
}

/* ============ 主循环 ============ */
function tick() {
  window.__ticks = (window.__ticks || 0) + 1
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastTick) / 1000 || 0.016)
  lastTick = now
  updatePlayer(dt); updateBalls(dt); updateCamera(); updateClouds(dt); updateLightUniforms()
  frameCount++
  if (!fpsWindow) { fpsWindow = now; lastHudT = now }
  if (now - fpsWindow >= 500) {
    fps.value = Math.round(frameCount * 1000 / (now - fpsWindow))
    frameCount = 0; fpsWindow = now
    const hdt = (now - lastHudT) / 1000
    if (hdt > 0 && hdt < 2) speed.value = Math.hypot(player.x - lastHx, player.z - lastHz) / hdt
    lastHx = player.x; lastHz = player.z; lastHudT = now
    pos.value = { x: player.x, y: player.y, z: player.z }
    const deg = ((player.yaw * 180 / Math.PI) % 360 + 360) % 360
    headingText.value = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(deg / 45) % 8]
    entities.value = placedCount
  }
}

/* ============ 事件 ============ */
const keys = new Set()
const pointerLocked = ref(false)
function onPointerLockChange() {
  pointerLocked.value = !!(viewer && document.pointerLockElement === viewer.canvas)
}
function onPointerLockError() {
  console.warn('[Engine] 指针锁定失败，使用鼠标位置瞄准模式')
}
function onKeyDown(e) {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
  keys.add(e.code)
  if (e.code === 'KeyC') toggleCam()
  if (e.code === 'KeyH') toggleUI()
  if (e.code >= 'Digit1' && e.code <= 'Digit9') selectedSlot.value = parseInt(e.code[5]) - 1
  // 双击空格切换飞行(创造模式)
  if (e.code === 'Space' && !e.repeat) {
    const now = performance.now()
    if (now - lastSpaceTap < 300) { flying.value = !flying.value; player.vy = 0; if (flying.value) keys.delete('Space') }
    lastSpaceTap = now
  }
}
function onKeyUp(e) { keys.delete(e.code) }
function onMouseMove(e) {
  if (viewer && document.pointerLockElement === viewer.canvas) {
    // 指针锁定:准星(屏幕中心)即瞄准点
    player.yaw = (player.yaw + e.movementX * 0.0042) % (Math.PI * 2)
    player.camPitch = clamp(player.camPitch - e.movementY * 0.0032, -1.5, 0.8)
    const rect = viewer.canvas.getBoundingClientRect()
    mouseLastX = rect.left + rect.width / 2
    mouseLastY = rect.top + rect.height / 2
  } else {
    const dx = e.clientX - mouseLastX, dy = e.clientY - mouseLastY
    mouseLastX = e.clientX; mouseLastY = e.clientY
    player.yaw = (player.yaw + dx * 0.0042) % (Math.PI * 2)
    player.camPitch = clamp(player.camPitch - dy * 0.0032, -1.5, 0.8)
  }
}
function onWheel(e) {
  const N = blockTypes.length
  if (e.deltaY > 0) selectedSlot.value = (selectedSlot.value + 1) % N
  else selectedSlot.value = (selectedSlot.value + N - 1) % N
}
let lastAct = 0
function oncePerClick() {
  const now = performance.now()
  if (now - lastAct < 250) return false // 防止 click+contextmenu 双触发
  lastAct = now
  return true
}
function onCanvasClick(e) {
  if (!viewer || e.target !== viewer.canvas) return // 只响应画布本身的点击
  e.preventDefault()
  ensureAudio() // 用户手势后启用音频
  const locked = document.pointerLockElement === viewer.canvas
  if (!locked) {
    try { viewer.canvas.requestPointerLock() } catch(err) {}
    if (selectedSlot.value === BALL_SLOT) { if (oncePerClick()) throwBall(); return }
    if (e.button === 0) { if (oncePerClick()) destroyBlock() }
    else if (e.button === 2) { if (oncePerClick()) placeAtClick() }
    return
  }
  // 锁定中：浏览器可能把右键以 click(button=2) 派发
  if (selectedSlot.value === BALL_SLOT) { if (oncePerClick()) throwBall(); return }
  if (e.button === 2) { if (oncePerClick()) placeAtClick() }
  else if (e.button === 0) { if (oncePerClick()) destroyBlock() }
}
function onCanvasContext(e) {
  if (!viewer || e.target !== viewer.canvas) return
  e.preventDefault()
  if (oncePerClick()) placeAtClick()
}

/* ============ 控制 ============ */
function toggleUI() { showUI.value = !showUI.value; document.body.classList.toggle('ui-hidden', !showUI.value) }
function toggleCam() { setCamMode(camMode.value === 'third' ? 'first' : 'third') }
function setCamMode(m) { camMode.value = m; const show = m !== 'first'; charParts.forEach(cp => { cp.show = show }) }
function resetPlayer() { player.x = 0; player.z = 0; player.y = voxelGroundY(0, 0) + 0.2; player.vy = 0; player.yaw = -Math.PI / 4 }

/* ============ 音效(Web Audio 程序化合成) ============ */
let audioCtx = null, noiseBuf = null
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    audioCtx = new AC()
    noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
}
function sfxNoise({ dur = 0.1, freq = 300, q = 1, gain = 0.1, type = 'lowpass' }) {
  if (!audioCtx || !noiseBuf) return
  const src = audioCtx.createBufferSource()
  src.buffer = noiseBuf
  const flt = audioCtx.createBiquadFilter()
  flt.type = type; flt.frequency.value = freq; flt.Q.value = q
  const g = audioCtx.createGain()
  const t = audioCtx.currentTime
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(flt); flt.connect(g); g.connect(audioCtx.destination)
  src.start(t); src.stop(t + dur + 0.02)
}
const sfxStep = () => sfxNoise({ dur: 0.055, freq: 260, q: 0.9, gain: 0.05 })
const sfxBreak = () => sfxNoise({ dur: 0.14, freq: 180, q: 1.4, gain: 0.17 })
const sfxPlace = () => sfxNoise({ dur: 0.07, freq: 620, q: 2.2, gain: 0.13 })

function makeDiscTex(inner, outer, craters) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const g = cv.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30)
  grad.addColorStop(0, inner); grad.addColorStop(0.72, inner); grad.addColorStop(1, outer)
  g.fillStyle = grad; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill()
  if (craters) { g.fillStyle = 'rgba(190,200,215,0.55)'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(14 + rand(g, 36), 14 + rand(g, 36), 2 + rand(g, 5), 0, Math.PI * 2); g.fill() } }
  return cv
}
/* ============ 云层(MC 风格块状云,缓慢漂移) ============ */
let cloudEntity = null
let cloudShift = 0
function makeCloudTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d')
  let seed = 99
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  // 硬边矩形叠块(MC 云是方块状,不做渐变)
  for (let i = 0; i < 320; i++) {
    const w = 8 + rnd() * 26, h = 8 + rnd() * 26
    g.fillStyle = 'rgba(255,255,255,' + (0.3 + rnd() * 0.45).toFixed(2) + ')'
    g.fillRect(rnd() * 256, rnd() * 256, w, h)
  }
  return cv
}
function buildClouds() {
  const tex = makeCloudTex()
  cloudEntity = viewer.entities.add({
    rectangle: {
      coordinates: new Cesium.CallbackProperty(() => rectFromLocal(-520 + cloudShift, -520, 520 + cloudShift, 520), false),
      material: new Cesium.ImageMaterialProperty({ image: tex, transparent: true }),
      height: 175,
      shadows: Cesium.ShadowMode.DISABLED,
    },
  })
}
function updateClouds(dt) {
  cloudShift += 1.6 * dt   // 风速 ~1.6 m/s
  if (cloudShift > 520) cloudShift -= 1040
}

let sunEntity = null, moonEntity = null
function buildCelestial() {
  const sunTex = makeDiscTex('rgba(255,246,200,1)', 'rgba(255,200,90,0)', false)
  const moonTex = makeDiscTex('rgba(240,246,255,1)', 'rgba(200,215,240,0)', true)
  const mkPos = (hourOffset) => new Cesium.CallbackProperty(() => {
    const t = (((sunHour.value + hourOffset) - 6) / 12) * Math.PI
    return wpos(player.x + Math.cos(t) * 420, player.y + Math.sin(t) * 420, player.z)
  }, false)
  sunEntity = viewer.entities.add({
    position: mkPos(0),
    billboard: { image: sunTex, width: 46, height: 46, disableDepthTestDistance: Number.POSITIVE_INFINITY, sizeInMeters: false },
  })
  moonEntity = viewer.entities.add({
    position: mkPos(12),
    billboard: { image: moonTex, width: 38, height: 38, disableDepthTestDistance: Number.POSITIVE_INFINITY, sizeInMeters: false },
  })
}
function updateSkyColor() {
  if (neonOn.value) return // 霓虹模式自己管背景色
  const h = sunHour.value
  const c = (h < 5 || h > 20) ? '#0a1230' : (h < 7 ? '#c9814f' : (h > 18 ? '#b5651d' : '#6fa8dc'))
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(c)
}

// 自定义方向光:按太阳高度角驱动强度(夜间降至月光级),否则 Cesium SunLight 不区分昼夜
let dirLight = null
function updateSunLight() {
  const t = ((sunHour.value - 6) / 12) * Math.PI
  const elev = Math.max(0.35, Math.sin(t))     // 夜间仍从上方照(月光感)
  const azim = Math.cos(t)
  const east = Cesium.Matrix4.getColumn(ENU, 0, new Cesium.Cartesian4())
  const up = Cesium.Matrix4.getColumn(ENU, 2, new Cesium.Cartesian4())
  const d = new Cesium.Cartesian3(
    -(east.x * azim + up.x * elev),
    -(east.y * azim + up.y * elev),
    -(east.z * azim + up.z * elev))
  Cesium.Cartesian3.normalize(d, d)
  const intensity = Math.max(0.1, Math.min(2.4, 0.1 + Math.sin(t) * 2.4))
  if (!dirLight) {
    dirLight = new Cesium.DirectionalLight({ direction: d, intensity })
    viewer.scene.light = dirLight
  } else {
    dirLight.direction = d
    dirLight.intensity = intensity
  }
}

/* ============ 初始化 ============ */
onMounted(async () => {
  try {
  await nextTick()
  viewer = new Cesium.Viewer(mountRef.value, {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, infoBox: false, sceneModePicker: false,
    navigationHelpButton: false, fullscreenButton: false, selectionIndicator: false,
    imageryProvider: false, baseLayer: false, shouldAnimate: true,
    skyAtmosphere: false, skyBox: false, creditContainer: document.createElement('div'),
  })
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a3050')
  viewer.scene.globe.show = false
  const cam3 = viewer.scene.screenSpaceCameraController
  cam3.enableInputs = false; cam3.enableRotate = false; cam3.enableTranslate = false
  cam3.enableZoom = false; cam3.enableTilt = false; cam3.enableLook = false
  viewer.scene.fog.enabled = true; viewer.scene.fog.density = fogDensity.value
  viewer.shadows = shadowOn.value
  viewer.scene.shadowMap.maximumDistance = 300
  viewer.scene.requestRenderMode = false
  viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED // 允许自由设定时钟(否则 currentTime 被钳制在默认范围)
  try { viewer.scene.msaaSamples = 4 } catch (e2) {}
  try { viewer.camera.frustum.fov = Cesium.Math.toRadians(70) } catch (e3) {} // MC 风格 FOV
  viewer.scene.highDynamicRange = true
  viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL
  viewer.scene.postProcessStages.bloom.enabled = bloomOn.value
  viewer.scene.postProcessStages.bloom.threshold = 0.9
  viewer.scene.postProcessStages.exposure = exposure.value
  viewer.camera.setView({ destination: wpos(0, surfaceYAt(0, 130) + 26, 130), orientation: { heading: 0.6, pitch: -0.38, roll: 0 } })
  // 先注册操控事件(就算后续场景出错也能操作)
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousemove', onMouseMove); window.addEventListener('wheel', onWheel)
  window.addEventListener('click', onCanvasClick); window.addEventListener('contextmenu', onCanvasContext)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('pointerlockerror', onPointerLockError)
  buildCharacter(); setCamMode(camMode.value); buildWorld(); initChunkRendering(); buildAllChunks(); buildCelestial(); buildClouds()
  // 出生点:放到地表(否则初始 y 会埋在基岩附近的地底)
  player.x = 0; player.z = 0; player.y = voxelGroundY(0, 0) + 0.2; player.vy = 0; player.yaw = -1.5 // 朝西(开阔谷地)
  applySun() // 初始化光照与天空颜色(与 sunHour 一致)
  lastTick = performance.now(); lastHudT = performance.now()
  const oldId = window.__intervalId; if (oldId) clearInterval(oldId)
  window.__intervalId = setInterval(tick, 16)
  // 自动昼夜循环
  window.__dayCycle = setInterval(() => { sunHour.value = (sunHour.value + 0.15) % 24; applySun() }, 3000)
  window.__engine = { viewer, player, tickCount: 0, voxelAt, setVoxelRaw, rebuildChunkAt, voxelGroundY, raycastVoxel, chunks, placeBlockVoxel, destroyBlock, settleColumn, flying, groundYAt, surfaceYAt, caveAt, glowLights, lightUniformSets, updateLightUniforms, ecefToVoxel }
  window.__Cesium = Cesium
  } catch(e) { window.__mountErr = String(e.stack || e.message || e); console.error('[Engine] mount error:', e) }
})

onBeforeUnmount(() => {
  document.body.classList.remove('ui-hidden')
  if (window.__intervalId) clearInterval(window.__intervalId)
  if (window.__dayCycle) clearInterval(window.__dayCycle)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('pointerlockerror', onPointerLockError)
  if (document.pointerLockElement) document.exitPointerLock()
  window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('wheel', onWheel)
  window.removeEventListener('click', onCanvasClick); window.removeEventListener('contextmenu', onCanvasContext)
  if (viewer && viewer.destroy) viewer.destroy(); viewer = null
})

// 曝光随昼夜调制(Cesium 材质环境光底噪高,仅靠光强无法压暗夜晚)
function applyExposure() {
  if (!viewer) return
  if (neonOn.value) { viewer.scene.postProcessStages.exposure = exposure.value; return }
  const t = ((sunHour.value - 6) / 12) * Math.PI
  const dayF = clamp(0.15 + 0.85 * Math.max(0, Math.sin(t)), 0.15, 1)
  viewer.scene.postProcessStages.exposure = exposure.value * dayF
}

function applySun() {
  if (!viewer) return
  // 场景位于北京(UTC+8):本地太阳时 = 滑块小时,换算成 UTC 驱动 Cesium 光照
  const utcH = ((sunHour.value - 8) + 24) % 24
  const hh = Math.floor(utcH), mm = Math.round((utcH - hh) * 60)
  const pad = (n) => String(n).padStart(2, '0')
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date('2026-06-21T' + pad(hh) + ':' + pad(mm) + ':00Z'))
  updateSkyColor()
  updateSunLight()
  applyExposure()
}
function onSunHour(e) { sunHour.value = parseFloat(e.target.value); applySun() }
function onFog(e) { fogDensity.value = parseFloat(e.target.value); if (viewer) { viewer.scene.fog.enabled = fogDensity.value > 0.0001; viewer.scene.fog.density = fogDensity.value } }
function setShadow(v) { shadowOn.value = v; if (viewer) viewer.shadows = v }
function setBloom(v) {
  bloomOn.value = v
  if (viewer) { viewer.scene.postProcessStages.bloom.enabled = v; viewer.scene.postProcessStages.bloom.threshold = neonOn.value ? 0.4 : 0.9 }
}
function onExposure(e) { exposure.value = parseFloat(e.target.value); applyExposure() }
function onTonemapper(e) {
  tonemapper.value = e.target.value
  if (viewer) {
    const m = ({ neutral: Cesium.Tonemapper.PBR_NEUTRAL, aces: Cesium.Tonemapper.ACES, filmic: Cesium.Tonemapper.FILMIC, none: Cesium.Tonemapper.NONE })[e.target.value]
    viewer.scene.postProcessStages.tonemapper = m
  }
}
function setNeon(v) {
  neonOn.value = v
  if (!viewer) return
  if (v) {
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#050510')
    viewer.scene.fog.color = Cesium.Color.fromCssColorString('#0a1030')
    viewer.scene.fog.enabled = true
    viewer.scene.fog.density = 0.003
    viewer.scene.postProcessStages.bloom.enabled = true
    viewer.scene.postProcessStages.bloom.threshold = 0.4
    exposure.value = 1.5; applyExposure()
    sunHour.value = 22; applySun()
  } else {
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a3050')
    viewer.scene.fog.color = Cesium.Color.WHITE
    viewer.scene.fog.density = fogDensity.value
    viewer.scene.fog.enabled = fogDensity.value > 0.0001
    viewer.scene.postProcessStages.bloom.enabled = bloomOn.value
    viewer.scene.postProcessStages.bloom.threshold = 0.9
    exposure.value = 1.2; applyExposure()
    sunHour.value = 13; applySun()
  }
}
</script>

<style scoped>
.engine-root { position: fixed; inset: 0; overflow: hidden; font-family: 'Segoe UI', 'PingFang SC', sans-serif; color: #e8ecf4; user-select: none; }
.mount { position: absolute; inset: 0; }
.mount canvas { outline: none; }
.crosshair { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; background: rgba(255,255,255,0.9); z-index: 20; pointer-events: none; transition: all 0.15s; }
.crosshair.locked { width: 14px; height: 14px; margin: -7px 0 0 -7px; background: transparent; border: 2px solid rgba(255,255,255,0.95); box-shadow: 0 0 6px rgba(0,0,0,0.6); border-radius: 50%; }

.topbar { position: absolute; top: 12px; right: 12px; display: flex; align-items: center; gap: 10px; z-index: 10; }
.fps { font-variant-numeric: tabular-nums; font-size: 13px; color: #bdf0a8; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }

/* 热键栏 */
.hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; z-index: 10; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 8px; border: 2px solid rgba(255,255,255,0.2); }
.slot { width: 48px; height: 48px; border-radius: 4px; cursor: pointer; border: 2px solid rgba(255,255,255,0.3); position: relative; image-rendering: pixelated; }
.slot.active { border-color: #fff; transform: scale(1.12); box-shadow: 0 0 10px rgba(255,255,255,0.5); }
.slotNum { position: absolute; top: 1px; left: 3px; font-size: 10px; color: #fff; text-shadow: 0 0 3px #000; font-weight: 700; }

.help { position: absolute; left: 12px; bottom: 12px; display: grid; grid-template-columns: repeat(3, auto); gap: 2px 12px; z-index: 10; font-size: 11px; color: rgba(255,255,255,0.7); background: rgba(10,14,24,0.5); padding: 6px 10px; border-radius: 8px; }
.help b { color: #aad0ff; }

.chip { pointer-events: auto; background: rgba(20,24,38,0.78); border: 1px solid rgba(120,150,255,0.28); color: #d7e4ff; font-size: 12px; padding: 4px 10px; border-radius: 14px; cursor: pointer; }
.chip:hover { background: rgba(50,70,120,0.9); }
.chip.on { background: #3d6bff; border-color: #8fb0ff; color: #fff; }
.ui-toggle { opacity: 0.6; padding: 3px 8px; font-size: 14px; }

.leftbar { position: absolute; top: 54px; left: 12px; display: flex; flex-direction: column; gap: 5px; z-index: 10; }
.console { position: absolute; top: 54px; right: 12px; width: 200px; z-index: 10; max-height: calc(100vh - 90px); overflow-y: auto; background: rgba(12,16,28,0.7); border: 1px solid rgba(120,150,230,0.2); border-radius: 10px; padding: 8px 10px; }
.console::-webkit-scrollbar { width: 4px; }
.console::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
.panel { border-bottom: 1px solid rgba(255,255,255,0.08); padding: 6px 0; }
.panel:last-child { border-bottom: none; }
.ptitle { font-size: 11px; font-weight: 700; color: #ffd9a0; margin-bottom: 6px; }
.ctrl { margin: 5px 0; }
.ctrl .label { display: block; font-size: 10px; color: rgba(255,255,255,0.65); margin-bottom: 2px; }
.ctrl input[type=range] { width: 100%; accent-color: #5a86ff; }
.ctrl select { width: 100%; background: #1b2136; border: 1px solid rgba(255,255,255,0.2); color: #d3e2ff; border-radius: 6px; padding: 3px; font-size: 11px; }
.switch { position: relative; display: inline-block; width: 34px; height: 18px; }
.switch input { opacity: 0; width: 0; height: 0; }
.switch .slider { position: absolute; cursor: pointer; inset: 0; background: #2c3248; border-radius: 18px; transition: 0.2s; }
.switch .slider:before { content: ''; position: absolute; width: 12px; height: 12px; left: 3px; top: 3px; background: #8fa3c8; border-radius: 50%; transition: 0.2s; }
.switch input:checked + .slider { background: #3d6bff; }
.switch input:checked + .slider:before { transform: translateX(16px); background: #fff; }
.stat { display: flex; align-items: center; justify-content: space-between; font-size: 11px; margin: 3px 0; color: rgba(255,255,255,0.7); }
.stat b { font-variant-numeric: tabular-nums; color: #b8e6ff; }
</style>