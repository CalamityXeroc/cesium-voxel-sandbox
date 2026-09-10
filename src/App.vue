<template>
  <div class="engine-root">
    <div ref="mountRef" class="mount"></div>
    <div class="crosshair" v-if="!invOpen" :class="{ locked: pointerLocked }"></div>

    <!-- 顶栏 -->
    <div class="topbar">
      <button class="chip ui-toggle" @click="toggleUI">{{ showUI ? '👁' : '👁' }}</button>
      <div class="fps">⚡ {{ fps.toFixed(0) }} fps</div>
    </div>

    <!-- 底部热键栏 -->
    <div class="hotbar">
      <div v-for="(k, i) in hotbar" :key="i"
        class="slot" :class="{ active: i === selectedSlot, empty: !k }"
        :title="itemName(k)"
        @click="selectedSlot = i">
        <img v-if="k" :src="itemIcon(k)" draggable="false" alt="" />
        <span class="slotNum">{{ i === 9 ? 0 : i + 1 }}</span>
      </div>
    </div>

    <!-- 背包(按 E 开关, 甲布局: 上半=全部物品无限源, 下半=快捷栏) -->
    <div v-if="invOpen" class="inv-overlay" @pointerdown.self="closeInv()">
      <div class="inv-panel">
        <div class="inv-head">
          <span class="inv-title">物品栏</span>
          <span class="inv-sub">选择物品放入快捷栏 · 全部物品无限取用</span>
          <button class="inv-close" @click="closeInv()">✕</button>
        </div>
        <div class="inv-label">背包</div>
        <div class="inv-grid">
          <div v-for="(k, i) in backpack" :key="k"
            class="islot" :class="{ hover: isHover('bag', i) }" :title="itemName(k)"
            @mouseenter="hoverSlot = { zone: 'bag', index: i }" @mouseleave="hoverSlot = null"
            @click="pickFromBackpack(k)">
            <img :src="itemIcon(k)" draggable="false" alt="" />
          </div>
        </div>
        <div class="inv-label">快捷栏<span class="inv-tip">点击选中 · 悬停按数字键 1-0 摆放</span></div>
        <div class="inv-row">
          <div v-for="(k, i) in hotbar" :key="'h' + i"
            class="islot hot" :class="{ active: i === selectedSlot, hover: isHover('hot', i), empty: !k }"
            :title="itemName(k) || '空'"
            @mouseenter="hoverSlot = { zone: 'hot', index: i }" @mouseleave="hoverSlot = null"
            @click="selectedSlot = i">
            <img v-if="k" :src="itemIcon(k)" draggable="false" alt="" />
            <span class="islotNum">{{ i === 9 ? 0 : i + 1 }}</span>
          </div>
        </div>
        <div class="inv-hint"><b>左键</b> 背包物品放入选中格 · <b>数字键</b> 悬停摆放/对调 · <b>E / ESC</b> 关闭</div>
      </div>
    </div>

    <!-- 按键提示 -->
    <div class="help">
      <div><b>W A S D</b> 移动</div>
      <div><b>空格</b> 跳跃</div>
      <div><b>左键</b> 破坏(可连挖)</div>
      <div><b>右键</b> 放置</div>
      <div><b>1-0</b> 选物品</div>
      <div><b>E</b> 背包</div>
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
const B = { GRASS: 1, DIRT: 2, STONE: 3, PLANK: 4, BRICK: 5, GLASS: 6, LOG: 7, LEAF: 8, SAND: 9, SNOW: 10, GLOW: 11,
            LOG_PINE: 12, LEAF_PINE: 13, LOG_BIRCH: 14, LEAF_BIRCH: 15, CACTUS: 16, SANDSTONE: 17,
            PLANT_GRASS: 18, FLOWER_RED: 19, FLOWER_YELLOW: 20 }
const PLANTS = [B.PLANT_GRASS, B.FLOWER_RED, B.FLOWER_YELLOW]
function isPlant(id) { return id === B.PLANT_GRASS || id === B.FLOWER_RED || id === B.FLOWER_YELLOW }
// 实心(阻挡/支撑): 非空气且非植物
function isSolidId(id) { return id !== AIR && !isPlant(id) }

// 纹理图集:512×512 canvas,8×8 共 64 格,每格 64×64(为群系新增方块扩容)
const ATLAS_SIZE = 512, TILE = 64, TILES_PER_ROW = 8
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
// ===== 群系新贴图 =====
// 森林草地(深绿,与平原草地区分)
makeBlockTex('grass_forest', 13, (g) => {
  g.fillStyle = '#4f7c3a'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(${rand(g,30)+50},${rand(g,40)+100},${rand(g,30)+40},0.45)`; g.fillRect(rand(g,64), rand(g,64), 3, 3) }
  g.fillStyle = '#6e5512'; g.fillRect(0, 48, 64, 16)
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 48, 64, 2)
})
// 松木(深色树皮)
makeBlockTex('log_pine', 14, (g) => {
  g.fillStyle = '#4a3524'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${rand(g,25)+50},${rand(g,20)+35},${rand(g,15)+20},0.55)`; g.fillRect(rand(g,58), 0, rand(g,5)+2, 64) }
  for (let i = 0; i < 7; i++) { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(i * 9 + 4, 0); g.lineTo(i * 9 + 4, 64); g.stroke() }
})
// 松针(深绿)
makeBlockTex('leaf_pine', 15, (g) => {
  g.fillStyle = '#2a5c33'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rand(g,30)+30},${rand(g,40)+75},${rand(g,25)+35},0.7)`; g.fillRect(rand(g,60), rand(g,60), rand(g,6)+3, rand(g,6)+3) }
  for (let i = 0; i < 50; i++) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(rand(g,60), rand(g,60), 3, 3) }
})
// 白桦木(白底黑斑)
makeBlockTex('log_birch', 16, (g) => {
  g.fillStyle = '#e6e2d6'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(180,175,160,0.5)'; g.fillRect(rand(g,60), 0, rand(g,4)+2, 64) }
  for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(40,38,34,0.85)'; g.fillRect(rand(g,56), rand(g,60), rand(g,10)+4, rand(g,3)+2) }
})
// 白桦叶(亮绿)
makeBlockTex('leaf_birch', 17, (g) => {
  g.fillStyle = '#6fae4a'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${rand(g,40)+90},${rand(g,50)+130},${rand(g,30)+50},0.6)`; g.fillRect(rand(g,60), rand(g,60), rand(g,7)+3, rand(g,7)+3) }
  for (let i = 0; i < 32; i++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(rand(g,60), rand(g,60), 3, 3) }
})
// 仙人掌
makeBlockTex('cactus', 18, (g) => {
  g.fillStyle = '#3f7f3a'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(rand(g,62), rand(g,62), 2, 3) }
  g.strokeStyle = 'rgba(20,50,20,0.7)'; g.lineWidth = 2
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(i * 13 + 6, 0); g.lineTo(i * 13 + 6, 64); g.stroke() }
  g.fillStyle = 'rgba(230,240,200,0.9)'
  for (let i = 0; i < 40; i++) g.fillRect(rand(g,62), rand(g,62), 2, 2)
})
// 沙岩(沙漠深层)
makeBlockTex('sandstone', 19, (g) => {
  g.fillStyle = '#d8c88f'; g.fillRect(0, 0, 64, 64)
  for (let r = 0; r < 4; r++) { g.fillStyle = r % 2 ? 'rgba(190,170,110,0.35)' : 'rgba(232,218,162,0.35)'; g.fillRect(0, r * 16, 64, 16) }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${rand(g,30)+190},${rand(g,25)+170},${rand(g,25)+120},0.4)`; g.fillRect(rand(g,62), rand(g,62), 2, 2) }
})
// 草丛(透明底,十字交叉渲染)
makeBlockTex('plant_grass', 20, (g) => {
  g.clearRect(0, 0, 64, 64)
  g.lineCap = 'round'
  g.strokeStyle = '#5c8f3a'; g.lineWidth = 3
  for (let i = 0; i < 9; i++) {
    const bx = 7 + i * 6 + rand(g, 3)
    g.beginPath(); g.moveTo(bx, 64)
    g.quadraticCurveTo(bx + rand(g, 10) - 5, 40, bx + rand(g, 16) - 8, 10 + rand(g, 12))
    g.stroke()
  }
  g.strokeStyle = '#7fb04c'; g.lineWidth = 2
  for (let i = 0; i < 6; i++) { const bx = 10 + i * 9; g.beginPath(); g.moveTo(bx, 64); g.lineTo(bx + 3, 26 + rand(g, 12)); g.stroke() }
})
// 花(红/黄,透明底)
function flowerTex(petal, core) {
  return (g) => {
    g.clearRect(0, 0, 64, 64)
    g.strokeStyle = '#4f7a2e'; g.lineWidth = 3
    g.beginPath(); g.moveTo(32, 64); g.lineTo(32, 28); g.stroke()
    g.fillStyle = '#5c8f3a'
    g.beginPath(); g.ellipse(22, 46, 9, 5, -0.5, 0, 6.3); g.fill()
    g.beginPath(); g.ellipse(43, 52, 9, 5, 0.5, 0, 6.3); g.fill()
    g.fillStyle = petal
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(32 + Math.cos(a) * 10, 24 + Math.sin(a) * 10, 8, 0, 6.3); g.fill() }
    g.fillStyle = core; g.beginPath(); g.arc(32, 24, 6, 0, 6.3); g.fill()
  }
}
makeBlockTex('flower_red', 21, flowerTex('#d8443c', '#f2d060'))
makeBlockTex('flower_yellow', 22, flowerTex('#e8c33c', '#8a6a20'))

// 体素 ID → 图集序号(与 B 对应)
const BLOCK_TEX = { [B.GRASS]: blockTexIdx.grass, [B.DIRT]: blockTexIdx.dirt, [B.STONE]: blockTexIdx.stone, [B.PLANK]: blockTexIdx.plank, [B.BRICK]: blockTexIdx.brick, [B.GLASS]: blockTexIdx.glass, [B.LOG]: blockTexIdx.log, [B.LEAF]: blockTexIdx.leaf, [B.SAND]: blockTexIdx.sand, [B.SNOW]: blockTexIdx.snow, [B.GLOW]: blockTexIdx.glow,
  [B.LOG_PINE]: blockTexIdx.log_pine, [B.LEAF_PINE]: blockTexIdx.leaf_pine, [B.LOG_BIRCH]: blockTexIdx.log_birch, [B.LEAF_BIRCH]: blockTexIdx.leaf_birch, [B.CACTUS]: blockTexIdx.cactus, [B.SANDSTONE]: blockTexIdx.sandstone,
  [B.PLANT_GRASS]: blockTexIdx.plant_grass, [B.FLOWER_RED]: blockTexIdx.flower_red, [B.FLOWER_YELLOW]: blockTexIdx.flower_yellow }
const LOG_TOP_TEX = blockTexIdx.log_top
const LOG_IDS = [B.LOG, B.LOG_PINE, B.LOG_BIRCH]
// 按面取纹理(原木顶/底面用年轮;草地按群系着色)
function faceTexFor(id, faceIdx, biome) {
  if (LOG_IDS.includes(id) && faceIdx <= 1) return LOG_TOP_TEX
  if (id === B.GRASS && biome === BIOME.FOREST) return blockTexIdx.grass_forest
  return BLOCK_TEX[id]
}

/* ============ 物品注册表 / 快捷栏 / 背包 ============ */
// 全部可获取物品:20 种方块 + 光球(非方块). 背包是无限源, 槽位只存 key
const ITEMS = [
  { key: 'grass', id: B.GRASS, name: '草方块' },
  { key: 'dirt', id: B.DIRT, name: '泥土' },
  { key: 'stone', id: B.STONE, name: '石头' },
  { key: 'sand', id: B.SAND, name: '沙子' },
  { key: 'sandstone', id: B.SANDSTONE, name: '沙岩' },
  { key: 'plank', id: B.PLANK, name: '木板' },
  { key: 'brick', id: B.BRICK, name: '砖块' },
  { key: 'glass', id: B.GLASS, name: '玻璃' },
  { key: 'snow', id: B.SNOW, name: '雪块' },
  { key: 'log', id: B.LOG, name: '橡木原木' },
  { key: 'log_pine', id: B.LOG_PINE, name: '松木原木' },
  { key: 'log_birch', id: B.LOG_BIRCH, name: '白桦原木' },
  { key: 'leaf', id: B.LEAF, name: '橡木树叶' },
  { key: 'leaf_pine', id: B.LEAF_PINE, name: '松木树叶' },
  { key: 'leaf_birch', id: B.LEAF_BIRCH, name: '白桦树叶' },
  { key: 'cactus', id: B.CACTUS, name: '仙人掌' },
  { key: 'plant_grass', id: B.PLANT_GRASS, name: '草丛' },
  { key: 'flower_red', id: B.FLOWER_RED, name: '红花' },
  { key: 'flower_yellow', id: B.FLOWER_YELLOW, name: '黄花' },
  { key: 'glow', id: B.GLOW, name: '萤石' },
  { key: 'ball', kind: 'item', name: '光球' },
]
const ITEM_BY_KEY = Object.fromEntries(ITEMS.map(it => [it.key, it]))
const HOTBAR_N = 10
const hotbar = ref(['grass', 'dirt', 'stone', 'plank', 'glass', 'log', 'leaf', 'sand', 'glow', 'ball'])
const backpack = ref(ITEMS.map(it => it.key))
const invOpen = ref(false)
const hoverSlot = ref(null)      // {zone:'bag'|'hot', index} 数字键摆放/对调的目标
function currentItem() { return ITEM_BY_KEY[hotbar.value[selectedSlot.value]] || null }

/* ============ 物品图标: 从图集即时绘制等轴测立方体 ============ */
const iconCache = new Map()
function iconTileRect(ti) { return [(ti % TILES_PER_ROW) * TILE, Math.floor(ti / TILES_PER_ROW) * TILE] }
function itemIcon(key) {
  let url = iconCache.get(key)
  if (url) return url
  const it = ITEM_BY_KEY[key]
  const S = 64, cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  g.imageSmoothingEnabled = false
  if (!it || it.kind === 'item') {
    // 光球: 径向渐变圆
    const rg = g.createRadialGradient(S * 0.38, S * 0.34, 2, S * 0.5, S * 0.5, S * 0.46)
    rg.addColorStop(0, '#fffdf0'); rg.addColorStop(0.45, '#ffd75e'); rg.addColorStop(1, '#d9821a')
    g.fillStyle = rg; g.beginPath(); g.arc(S / 2, S / 2, S * 0.44, 0, 6.3); g.fill()
  } else if (isPlant(it.id)) {
    // 植物: 平面立绘(MC 里草丛/花也是平面图标)
    const [x, y] = iconTileRect(BLOCK_TEX[it.id])
    g.drawImage(atlasCanvas, x, y, TILE, TILE, 3, 3, S - 6, S - 6)
  } else {
    // 等轴测: 顶面菱形(2:1) + 左右侧面, 亮度 1.0 / 0.78 / 0.56
    const w = 30, hh = 15, H = 26, cx = S / 2, cy = 18
    const [sx, sy] = iconTileRect(BLOCK_TEX[it.id])
    const [tx, ty] = iconTileRect(LOG_IDS.includes(it.id) ? LOG_TOP_TEX : BLOCK_TEX[it.id])
    const face = (a, b, c, d, e, f, x, y, bright) => {
      g.setTransform(a, b, c, d, e, f)
      if (bright !== 1) g.filter = `brightness(${bright})`
      g.drawImage(atlasCanvas, x, y, TILE, TILE, 0, 0, 1, 1)
      g.filter = 'none'
    }
    face(w, hh, 0, H, cx - w, cy, sx, sy, 0.78)      // 左面
    face(w, -hh, 0, H, cx, cy + hh, sx, sy, 0.56)    // 右面
    face(w, hh, -w, hh, cx, cy - hh, tx, ty, 1)      // 顶面
    g.setTransform(1, 0, 0, 1, 0, 0)
  }
  url = cv.toDataURL()
  iconCache.set(key, url)
  return url
}

/* ============ 本地世界坐标 ============ */
const ORIGIN = Cesium.Cartesian3.fromDegrees(116.3983, 39.9135)
const ENU = Cesium.Transforms.eastNorthUpToFixedFrame(ORIGIN)
const ENU_INV = Cesium.Matrix4.inverse(ENU, new Cesium.Matrix4())
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }
// 本地体素坐标(x=east, y=up, z=north) → ECEF
// 必须用 ENU 矩阵,不能用简化经纬度换算(111320*cosLat / 110542 与 WGS84 椭球有 0.1~0.5% 偏差,
// 会造成随距离增长的偏移: 选中框/碎屑/光斑/角色相对方块位置越来越偏)
const _wposLocal = new Cesium.Cartesian3()
function wpos(x, y, z) {
  _wposLocal.x = x; _wposLocal.y = z; _wposLocal.z = y
  return Cesium.Matrix4.multiplyByPoint(ENU, _wposLocal, new Cesium.Cartesian3())
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
const chunkKeyOf = (cx, cz) => (cx + 512) * 1024 + (cz + 512)   // 数值 key: AO 采样量大时比字符串快得多

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
// 是否遮挡相邻面(玻璃半透明不遮挡;植物不遮挡且自身不参与剔除)
function isOpaque(id) { return id !== AIR && id !== B.GLASS && !isPlant(id) }
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

/* ---- 生物群系:温度/湿度气候噪声 → 草原/森林/沙漠/雪原 ---- */
const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOWY: 3 }
function climateAt(x, z) {
  let temp = fbm2(x + 2100, z - 1700, 2, 1 / 140, 0.5, 2)
  let humid = fbm2(x - 3300, z + 2900, 2, 1 / 110, 0.5, 2)
  // 出生区偏置:距原点 48 格内把气候拉回平原区间,保证出生点观感
  const bias = clamp(1 - Math.hypot(x, z) / 48, 0, 1)
  temp *= (1 - bias); humid *= (1 - bias)
  return [temp, humid]
}
function biomeAt(x, z) {
  const [t, h] = climateAt(x, z)
  if (t < -0.18) return BIOME.SNOWY
  if (t > 0.16 && h < -0.02) return BIOME.DESERT
  if (h > 0.12) return BIOME.FOREST
  return BIOME.PLAINS
}

/* ---- 地表高度:大陆度 + 缓丘(平坦化: 大尺度缓坡,实际相邻高差约 1.3 格/8格) ---- */
const BASE_Y = 64
function surfaceYAt(x, z) {
  const cont = fbm2(x, z, 2, 1 / 300, 0.5, 2)                 // 大陆度(大尺度缓坡)
  const pv = fbm2(x - 500, z + 500, 2, 1 / 120, 0.5, 2)       // 缓丘
  const h = BASE_Y + cont * 20 + pv * 6
  return clamp(Math.round(h), 26, 150)
}
function groundYAt(x, z) { return surfaceYAt(x, z) }

/* ---- 3D 密度:决定实/空(低振幅低倍频,地表平整) ---- */
function densityAt(x, y, z, sy) {
  const base = (sy - y) / 9
  const n = fbm3(x, y * 1.5, z, 2, 1 / 90, 0.5, 2)
  return base + n * 0.5
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
      const biome = spawnFlat ? BIOME.PLAINS : biomeAt(x, z)
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
          if (biome === BIOME.DESERT) {
            if (y >= sy - 3) id = B.SAND                       // 沙漠:表层沙
            else if (y >= sy - 7) id = B.SANDSTONE             // 次层沙岩
            else id = B.STONE
          } else if (biome === BIOME.SNOWY) {
            if (y >= sy - 1) id = B.SNOW                       // 雪原:表层雪
            else if (y >= sy - 4) id = B.DIRT
            else id = B.STONE
          } else {
            if (y >= sy - 1) id = B.GRASS                      // 草原/森林:草地(群系着色)
            else if (y >= sy - 4) id = B.DIRT
            else id = B.STONE
          }
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

// 顶点环境光遮蔽(AO):采样面外侧的 side1/side2/corner 三个邻居(MC 风格)
const AO_LEVELS = [0.5, 0.68, 0.84, 1.0]
function aoSolidAt(x, y, z) { return isOpaque(voxelAt(x, y, z)) ? 1 : 0 }
function vertexAO(vx, vy, vz, f, ci) {
  const c = f.corners[ci]
  const vc = [c[0], c[2], c[1]]              // ENU 角点 → 体素空间(x=E, y=U, z=N)
  const n = f.dir
  const axis = n[0] !== 0 ? 0 : (n[1] !== 0 ? 1 : 2)   // 法线轴
  const a = axis === 0 ? 1 : 0                          // 切向轴 u
  const b = axis === 2 ? 1 : 2                          // 切向轴 v
  const su = vc[a] === 1 ? 1 : -1
  const sv = vc[b] === 1 ? 1 : -1
  const px = vx + n[0], py = vy + n[1], pz = vz + n[2]  // 面外侧基准
  const ua = a === 0 ? su : 0, ub = a === 1 ? su : 0, uc = a === 2 ? su : 0
  const va = b === 0 ? sv : 0, vb = b === 1 ? sv : 0, vcz = b === 2 ? sv : 0
  const s1 = aoSolidAt(px + ua, py + ub, pz + uc)
  const s2 = aoSolidAt(px + va, py + vb, pz + vcz)
  const cc = aoSolidAt(px + ua + va, py + ub + vb, pz + uc + vcz)
  if (s1 && s2) return AO_LEVELS[0]                     // 两边都堵 → 最暗
  return AO_LEVELS[3 - (s1 + s2 + cc)]
}

// 构建 chunk 的三个 geometry:不透明 + 玻璃(半透明) + 植物(十字裁剪)
function buildChunkGeometries(cx, cz) {
  const ox = cx * VOX_W, oz = cz * VOX_D
  const opaque = { pos: [], nor: [], uv: [], ao: [], idx: [] }
  const glass = { pos: [], nor: [], uv: [], ao: [], idx: [] }   // 半透明层(玻璃)
  const plants = { pos: [], nor: [], uv: [], ao: [], idx: [] }  // 植物层(交叉面)
  const arr = chunks.get(chunkKeyOf(cx, cz))
  if (!arr) return null
  const topY = Math.min(VOX_H - 1, chunkTop.get(chunkKeyOf(cx, cz)) ?? VOX_H - 1)
  // 每列群系(决定草地贴图着色)
  const biomeCol = new Array(VOX_W * VOX_D)
  for (let lx = 0; lx < VOX_W; lx++) for (let lz = 0; lz < VOX_D; lz++) biomeCol[lx * VOX_D + lz] = biomeAt(ox + lx, oz + lz)
  for (let ly = 0; ly <= topY; ly++) for (let lx = 0; lx < VOX_W; lx++) for (let lz = 0; lz < VOX_D; lz++) {
    const id = arr[voxelIndex(lx, ly, lz)]
    if (!id) continue
    const wx = ox + lx, wy = ly, wz = oz + lz
    const biome = biomeCol[lx * VOX_D + lz]
    // 植物:两个交叉对角面(双面渲染由 plantAppearance 负责,不参与邻面剔除)
    if (isPlant(id)) {
      const ti = BLOCK_TEX[id]
      if (ti === undefined) continue
      const uvs = faceUVs(ti)
      const lo = 0.12, hi = 0.88
      const quads = [
        [[lo, 0, lo], [hi, 0, hi], [hi, 1, hi], [lo, 1, lo]],
        [[hi, 0, lo], [lo, 0, hi], [lo, 1, hi], [hi, 1, lo]],
      ]
      for (const q of quads) {
        const base = plants.pos.length / 3
        for (let ci = 0; ci < 4; ci++) {
          const c = q[ci]
          plants.pos.push(wx + c[0], wz + c[2], wy + c[1])   // 体素(x=E,y=U,z=N) → ENU(E,N,U)
          plants.nor.push(0, 1, 0)
          plants.uv.push(uvs[ci][0], uvs[ci][1])
          plants.ao.push(1)
        }
        plants.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
      }
      continue
    }
    const translucent = isTranslucentId(id)
    const target = translucent ? glass : opaque
    for (let fi = 0; fi < FACES.length; fi++) {
      const f = FACES[fi]
      const nb = voxelAt(wx + f.dir[0], wy + f.dir[1], wz + f.dir[2])
      // 剔除:半透明方块仅与同种方块互剔;不透明方块被不透明邻块遮挡
      const hidden = translucent ? (nb === id) : isOpaque(nb)
      if (hidden) continue
      const ti = faceTexFor(id, fi, biome)
      if (ti === undefined) continue
      const base = target.pos.length / 3
      const uvs = faceUVs(ti)
      for (let ci = 0; ci < 4; ci++) {
        const c = f.corners[ci]
        target.pos.push(wx + c[0], wz + c[1], wy + c[2])   // 体素(x=east,y=up,z=north) → ENU(E,N,U)
        target.nor.push(f.n[0], f.n[1], f.n[2])
        target.uv.push(uvs[ci][0], uvs[ci][1])
        target.ao.push(vertexAO(wx, wy, wz, f, ci))
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
        ao: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 1, values: new Float32Array(d.ao) }),
      },
      indices: new Uint32Array(d.idx),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(d.pos),
    })
  }
  return { opaque: mk(opaque), glass: mk(glass), plants: mk(plants) }
}

// 局部 ENU(东,北,上) → ECEF 的变换矩阵(右手系,与 Cesium eastNorthUpToFixedFrame 一致)
let WORLD_MATRIX = null
function computeWorldMatrix() {
  WORLD_MATRIX = ENU
}

let chunkAppearance = null, glassAppearance = null, plantAppearance = null
const MAX_LIGHTS = 8
const lightUniformSets = []   // 每个 appearance 一套 uniform

/* 体素着色器:太阳光用场景光源自动 uniform,萤石用同一 Lambert 模型的点光源 */
const VOXEL_VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in float ao;
in float batchId;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec2 v_st;
out float v_ao;

void main()
{
    vec4 p = czm_computePosition();
    v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
    v_normalEC = czm_normal * normal;
    v_st = st;
    v_ao = ao;
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`
const VOXEL_FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;
in float v_ao;

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

    color *= v_ao;   // 环境光遮蔽(顶点插值)

    out_FragColor = vec4(color, material.alpha);
}
`

const VOXEL_FS_CUTOUT = VOXEL_FS.replace(
  '    out_FragColor = vec4(color, material.alpha);',
  '    if (material.alpha < 0.5) discard;\n    out_FragColor = vec4(color, 1.0);')

function initChunkRendering() {
  computeWorldMatrix()
  const makeApp = (translucent, fsSource, cull) => {
    const app = new Cesium.Appearance({
      material: Cesium.Material.fromType('Image', { image: atlasCanvas }),
      vertexShaderSource: VOXEL_VS,
      fragmentShaderSource: fsSource || VOXEL_FS,
      vertexFormat: Cesium.VertexFormat.POSITION_NORMAL_AND_ST,
      translucent,
      renderState: { depthTest: { enabled: true }, cull: { enabled: cull, face: Cesium.CullFace.BACK } },
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
  chunkAppearance = makeApp(false, null, true)
  glassAppearance = makeApp(true, null, false)
  plantAppearance = makeApp(false, VOXEL_FS_CUTOUT, false)   // 交叉面双面 + alpha 裁剪
}

/* 每帧更新点光源眼空间位置(取离相机最近的 MAX_LIGHTS 个萤石) */
const scratchLightWorld = new Cesium.Cartesian3()
const scratchLightECs = Array.from({ length: MAX_LIGHTS }, () => new Cesium.Cartesian3())   // 每槽位独立,避免 uniform 引用被覆盖
const scratchLightColors = Array.from({ length: MAX_LIGHTS }, () => new Cesium.Cartesian3())
const LIGHT_TINT = new Cesium.Cartesian3(1, 0.98, 0.92)   // 微暖白
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
      // 每个槽位必须用独立 scratch: 共用会把之前槽位的 uniform 引用覆盖成最后一块的位置
      lp = Cesium.Matrix4.multiplyByPoint(viewMatrix, scratchLightWorld, scratchLightECs[i])
      lc = Cesium.Cartesian3.multiplyByScalar(LIGHT_TINT, intensity, scratchLightColors[i]) // 微暖白
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
    if (old.plants) viewer.scene.primitives.remove(old.plants)
    chunkPrimitives.delete(key)
  }
  const geos = buildChunkGeometries(cx, cz)
  if (!geos) return
  const rec = { opaque: null, glass: null, plants: null }
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
  rec.plants = mkPrim(geos.plants, plantAppearance, false)
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
// 确定性哈希(同一种子下世界可复现) — 必须用 Math.imul 保持 int32 运算,
// 否则乘法溢出 2^53 精度后值域只剩 [0,0.5],分布严重偏斜
function hash2(x, z, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1117307467)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// 橡树(草原/森林)
function addVoxelTree(x, z, gy) {
  const h = 3 + Math.floor(Math.random() * 2)
  for (let y = gy; y < gy + h; y++) setVoxelRaw(x, y, z, B.LOG)
  const top = gy + h
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) + Math.abs(dz) > 3) continue
    for (let dy = 0; dy <= 1; dy++) {
      if (dx === 0 && dz === 0 && dy === 0) continue
      if (!voxelAt(x + dx, top + dy, z + dz)) setVoxelRaw(x + dx, top + dy, z + dz, B.LEAF)
    }
  }
  setVoxelRaw(x, top + 1, z, B.LEAF)
}
// 白桦(森林,高瘦亮叶)
function addBirchAt(x, z, gy) {
  const h = 5 + Math.floor(Math.random() * 3)
  for (let y = gy; y < gy + h; y++) setVoxelRaw(x, y, z, B.LOG_BIRCH)
  const top = gy + h
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) + Math.abs(dz) > 2) continue
    for (let dy = 0; dy <= 1; dy++) {
      if (dx === 0 && dz === 0 && dy === 0) continue
      if (!voxelAt(x + dx, top + dy, z + dz)) setVoxelRaw(x + dx, top + dy, z + dz, B.LEAF_BIRCH)
    }
  }
  setVoxelRaw(x, top + 1, z, B.LEAF_BIRCH)
}
// 云杉(雪原,分层锥形深色)
function addPineAt(x, z, gy) {
  const h = 5 + Math.floor(Math.random() * 3)
  for (let y = gy; y < gy + h; y++) setVoxelRaw(x, y, z, B.LOG_PINE)
  const top = gy + h
  const radii = [2, 2, 1, 1, 0]   // 从上到下变宽
  for (let i = 0; i < radii.length; i++) {
    const y = top + 1 - i
    if (y <= gy) continue
    const r = radii[i]
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > r + 1) continue
      if (dx === 0 && dz === 0 && i < radii.length - 1) continue   // 保留树干
      if (!voxelAt(x + dx, y, z + dz)) setVoxelRaw(x + dx, y, z + dz, B.LEAF_PINE)
    }
  }
}
// 仙人掌(沙漠,立柱)
function addCactusAt(x, z, gy) {
  const h = 2 + Math.floor(Math.random() * 3)
  for (let y = gy; y < gy + h; y++) setVoxelRaw(x, y, z, B.CACTUS)
}

/* ---- 树木:全图按群系密度散布(森林最密) ---- */
function plantTrees() {
  for (let gx = -WORLD_HALF + 4; gx < WORLD_HALF - 4; gx += 4) {
    for (let gz = -WORLD_HALF + 4; gz < WORLD_HALF - 4; gz += 4) {
      const x = gx + Math.floor(hash2(gx, gz, 1) * 4)
      const z = gz + Math.floor(hash2(gx, gz, 2) * 4)
      if (Math.abs(x) < 16 && Math.abs(z) < 16) continue          // 出生区留空
      const biome = biomeAt(x, z)
      const p = biome === BIOME.FOREST ? 0.32 : biome === BIOME.SNOWY ? 0.14 : biome === BIOME.DESERT ? 0.035 : 0.06
      if (hash2(x, z, 3) > p) continue
      const gy = voxelGroundY(x, z)
      if (voxelAt(x, gy, z)) continue                             // 柱位需空
      const below = voxelAt(x, gy - 1, z)
      if (biome === BIOME.DESERT) {
        if (below !== B.SAND) continue
        addCactusAt(x, z, gy)
      } else if (biome === BIOME.SNOWY) {
        if (below !== B.SNOW && below !== B.GRASS) continue
        addPineAt(x, z, gy)
      } else {
        if (below !== B.GRASS) continue
        if (biome === BIOME.FOREST && hash2(x, z, 4) < 0.45) addBirchAt(x, z, gy)
        else addVoxelTree(x, z, gy)
      }
    }
  }
}

/* ---- 小型植被:草地表按群系概率散布草丛/花 ---- */
function scatterPlants() {
  for (let x = -WORLD_HALF + 2; x < WORLD_HALF - 2; x++) {
    for (let z = -WORLD_HALF + 2; z < WORLD_HALF - 2; z++) {
      if (Math.abs(x) < 13 && Math.abs(z) < 13) continue
      const biome = biomeAt(x, z)
      const p = biome === BIOME.FOREST ? 0.14 : biome === BIOME.PLAINS ? 0.04 : 0
      if (p === 0 || hash2(x, z, 11) > p) continue
      const gy = voxelGroundY(x, z)
      if (voxelAt(x, gy, z)) continue
      if (voxelAt(x, gy - 1, z) !== B.GRASS) continue
      const pick = hash2(x, z, 12)
      setVoxelRaw(x, gy, z, pick < 0.62 ? B.PLANT_GRASS : pick < 0.81 ? B.FLOWER_RED : B.FLOWER_YELLOW)
    }
  }
}

/* ---- 露天洞穴: 地下洞厅 + 斜通地表的漏斗口(可见、可走入) ---- */
function carveOpenCave(cx, cz) {
  const sy = surfaceYAt(cx, cz)
  const chamberY = sy - 10          // 洞厅中心高度
  const R = 7, RY = 3.5            // 洞厅椭球半径(水平/垂直)
  if (chamberY - RY < 7) return
  // 1. 洞厅(椭球)
  for (let x = cx - Math.ceil(R); x <= cx + Math.ceil(R); x++) {
    for (let z = cz - Math.ceil(R); z <= cz + Math.ceil(R); z++) {
      for (let y = Math.max(4, chamberY - Math.ceil(RY)); y <= Math.min(sy + 1, chamberY + Math.ceil(RY)); y++) {
        const dx = (x - cx) / R, dy = (y - chamberY) / RY, dz = (z - cz) / R
        if (dx * dx + dy * dy + dz * dz < 1) setVoxelRaw(x, y, z, AIR)
      }
    }
  }
  // 2. 漏斗口: 从洞厅斜通地表,越靠上越宽(噪声决定漂移与形状)
  const topY = sy + 1
  for (let y = chamberY; y <= topY; y++) {
    const t = (y - chamberY) / Math.max(1, topY - chamberY)
    const mx = cx + 2 + noise2D(cx * 0.23 + 17, y * 0.19) * 3 * t
    const mz = cz - 2 + noise2D(cz * 0.23 - 41, y * 0.19) * 3 * t
    const r = 1.1 + t * t * 3.4
    for (let x = Math.floor(mx - r); x <= Math.ceil(mx + r); x++) {
      for (let z = Math.floor(mz - r); z <= Math.ceil(mz + r); z++) {
        const dx = x - mx, dz = z - mz
        if (dx * dx + dz * dz <= r * r && y >= 4) setVoxelRaw(x, y, z, AIR)
      }
    }
  }
}

function buildWorld() {
  genTerrain()
  // 露天洞穴 2 处(避开出生区)
  carveOpenCave(36, -30)
  carveOpenCave(-44, 26)
  // 树木与植被(按群系密度)
  plantTrees()
  scatterPlants()
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
// 从玩家脚下向下扫第一个实心格(悬空桥/天花板场景正确;植物不阻挡)
function groundHeight(x, z) {
  const bx = Math.floor(x), bz = Math.floor(z)
  const startY = Math.min(VOX_H - 1, Math.floor(player.y + 0.001))
  for (let y = startY; y >= 0; y--) if (isSolidId(voxelAt(bx, y, bz))) return y + 1
  return 0
}
function voxelGroundY(x, z) {
  const bx = Math.floor(x), bz = Math.floor(z)
  const cx = Math.floor(bx / VOX_W), cz = Math.floor(bz / VOX_D)
  const top = Math.min(VOX_H - 1, chunkTop.get(chunkKeyOf(cx, cz)) ?? VOX_H - 1)
  for (let y = top; y >= 0; y--) if (isSolidId(voxelAt(bx, y, bz))) return y + 1
  return 0
}
// 玩家 AABB(x±radius, y..y+height, z±radius) 是否与某实心体素格相交
function playerIntersectsVoxel(bx, by, bz) {
  if (!isSolidId(voxelAt(bx, by, bz))) return false
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
    if (!isSolidId(voxelAt(bx, by, bz))) continue
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
    // 空气与植物都可被沙埋没
    while (cy > 0) { const bid = voxelAt(x, cy - 1, z); if (bid === AIR || isPlant(bid)) cy--; else break }
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
  // 仅萤石本体上的小光斑,真正的照明由体素着色器的点光源完成
  // 注:本项目场景中 sizeInMeters:true 的 billboard 不渲染(实测),光斑用像素尺寸
  const e = viewer.entities.add({
    position: wpos(x + 0.5, y + 0.5, z + 0.5),
    billboard: {
      image: getGlowCoreTex(),
      width: 30, height: 30,
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

/* ============ 选中高亮(MC 风格线框) & 连续破坏 ============ */
// 实测: PolylineCollection / LINES / Entity box 在本场景均不渲染;
// 唯一可靠的渲染路径是体素 chunk 同构管线(TRIANGLES + Image/Color material + POSITION_NORMAL_AND_ST)。
// 故线框 = 12 条细长盒子(截面 0.024m)三角化 + 与 chunk 相同的 Appearance 结构,& 目标变化时重建(微秒级)。
let hlPrimitive = null, hlAppearance = null
let hlKey = null   // 当前高亮的方块 key(变化才重建)

const HL_VS = `
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
const HL_FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;
void main()
{
    czm_materialInput materialInput;
    materialInput.normalEC = normalize(v_normalEC);
    materialInput.positionToEyeEC = -v_positionEC;
    materialInput.st = v_st;
    czm_material material = czm_getMaterial(materialInput);
    out_FragColor = vec4(material.diffuse, material.alpha);
}
`

// 线框 geometry: 12 条边各一个细长盒子(截面 0.024m),顶点烘到 ECEF,带 normal/st(与 chunk 同格式)
function buildHLGeometry(hit) {
  const [hx, hy, hz] = hit
  const e = 0.004          // 沿棱方向外伸(保证拐角接合)
  const t2 = 0.005         // 线半厚(总粗 0.01m,细线贴边)
  const pos = [], nor = [], sts = [], idx = []
  const box = (x0, y0, z0, x1, y1, z1) => {
    const c = [
      [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
    ]
    const faces = [[0,3,7,4],[1,5,6,2],[0,4,5,1],[3,2,6,7],[0,1,5,4],[3,7,6,2]]   // 6 面
    let base = pos.length / 3
    for (const f of faces) {
      for (const vi of f) {
        const q = c[vi]
        const w = wpos(hx + q[0], hy + q[1], hz + q[2])
        pos.push(w.x, w.y, w.z)
        nor.push(0, 0, 1)
        sts.push(0, 0)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
      base += 4
    }
  }
  // 底面 4 条(X/Z 向) + 顶面 4 条 + 竖边 4 条
  for (const y of [0, 1]) for (const z of [0, 1]) box(-e, y - t2, z - t2, 1 + e, y + t2, z + t2)
  for (const x of [0, 1]) for (const z of [0, 1]) box(x - t2, -e, z - t2, x + t2, 1 + e, z + t2)
  for (const x of [0, 1]) for (const y of [0, 1]) box(x - t2, y - t2, -e, x + t2, y + t2, 1 + e)
  return new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: pos }),
      normal: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: nor }),
      st: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: sts }),
    },
    indices: new Uint32Array(idx),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(pos),
  })
}

function initHighlight() {
  hlAppearance = new Cesium.Appearance({
    material: Cesium.Material.fromType('Color', { color: Cesium.Color.WHITE.withAlpha(0.85) }),
    vertexShaderSource: HL_VS,
    fragmentShaderSource: HL_FS,
    vertexFormat: Cesium.VertexFormat.POSITION_NORMAL_AND_ST,   // 与 chunk 同构
    renderState: { depthTest: { enabled: true }, cull: { enabled: false } },   // 双面:细长盒各面朝向不一
    translucent: true,
    closed: false,
  })
  hlPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: buildHLGeometry([0, -10, 0]) }),
    appearance: hlAppearance,
    asynchronous: false,
  })
  hlPrimitive.show = false
  viewer.scene.primitives.add(hlPrimitive)
}
// 每帧: 把线框套到准星指向的方块上;无目标则隐藏(仅目标变化时重建,微秒级)
function updateHighlight(hit) {
  if (!hlPrimitive) return
  if (!hit) {
    if (hlPrimitive.show) hlPrimitive.show = false
    return
  }
  hlPrimitive.show = true
  const key = hit.join(',')
  if (key === hlKey) return
  hlKey = key
  viewer.scene.primitives.remove(hlPrimitive)
  hlPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: buildHLGeometry(hit) }),
    appearance: hlAppearance,
    asynchronous: false,
  })
  viewer.scene.primitives.add(hlPrimitive)
}
let attacking = false          // 左键是否按住
let attackCooldown = 0         // 连续破坏间隔计时(秒)
const ATTACK_INTERVAL = 0.22   // 连挖间隔(秒, 约 MC 创造模式 5 ticks)

function initInteractionVisuals() {
  initHighlight()
}
// 按下左键:立即破坏准星方块(一击即碎),并开始连续破坏计时
function attackStart() {
  attacking = true
  attackCooldown = ATTACK_INTERVAL
  const ray = raycastVoxel(MAX_REACH)
  if (ray) destroyBlockAt(ray.hit[0], ray.hit[1], ray.hit[2])
}
function attackStop() { attacking = false; attackCooldown = 0 }
// 每帧:更新高亮框位置 + 按住左键连续破坏
function updateInteraction(dt) {
  if (!viewer || !hlPrimitive) return
  if (invOpen.value) {          // 背包打开: 停止交互并隐藏选中框
    if (attacking) attackStop()
    updateHighlight(null)
    return
  }
  const ray = raycastVoxel(MAX_REACH)
  updateHighlight(ray ? ray.hit : null)
  if (!attacking) return
  attackCooldown -= dt
  if (attackCooldown > 0) return
  attackCooldown = ATTACK_INTERVAL
  if (ray) destroyBlockAt(ray.hit[0], ray.hit[1], ray.hit[2])
}

/* ============ 破坏碎屑粒子(MC 风格: 方块纹理小片段爆开,Entity 实现) ============ */
// 注:不用 scene.primitives 的 BillboardCollection —— 实测米制尺寸在该方式下不渲染;Entity billboard(同日月/萤石光斑)已验证可见
const debrisList = []
const debrisTexCache = new Map()   // 方块id -> 4 个随机 16x16 纹理片段
const DEBRIS_COUNT = 16

// 从图集裁剪该方块的随机小片段作为碎屑纹理(草地按群系取对应贴图)
function debrisTex(id, biome) {
  const key = id + '|' + (biome === undefined ? '' : biome)
  let arr = debrisTexCache.get(key)
  if (!arr) {
    arr = []
    const ti = faceTexFor(id, 2, biome)   // 侧面纹理
    if (ti !== undefined) {
      const sx = (ti % TILES_PER_ROW) * TILE, sy = Math.floor(ti / TILES_PER_ROW) * TILE
      for (let i = 0; i < 4; i++) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 16
        cv.getContext('2d').drawImage(atlasCanvas,
          sx + Math.floor(Math.random() * (TILE - 16)), sy + Math.floor(Math.random() * (TILE - 16)), 16, 16, 0, 0, 16, 16)
        arr.push(cv)
      }
    }
    debrisTexCache.set(key, arr)
  }
  return arr.length ? arr[(Math.random() * arr.length) | 0] : null
}
function spawnDebris(x, y, z, id) {
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const tex = debrisTex(id, biomeAt(x, z))
    if (!tex) break
    const d = {
      x: x + 0.15 + Math.random() * 0.7,
      y: y + 0.15 + Math.random() * 0.7,
      z: z + 0.15 + Math.random() * 0.7,
      vx: (Math.random() - 0.5) * 3.4,
      vy: 1.6 + Math.random() * 2.4,
      vz: (Math.random() - 0.5) * 3.4,
      life: 0.55 + Math.random() * 0.45,
      size: 0.11 + Math.random() * 0.09,
    }
    d.e = viewer.entities.add({
      position: new Cesium.CallbackProperty(() => wpos(d.x, d.y, d.z), false),
      billboard: { image: tex, width: 14, height: 14 },   // 像素尺寸;每帧按距离换算米制大小
    })
    debrisList.push(d)
  }
}
function updateDebris(dt) {
  if (!debrisList.length) return
  for (let i = debrisList.length - 1; i >= 0; i--) {
    const d = debrisList[i]
    d.life -= dt
    if (d.life <= 0) { viewer.entities.remove(d.e); debrisList.splice(i, 1); continue }
    d.vy += GRAVITY * dt
    const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt, nz = d.z + d.vz * dt
    if (voxelAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
      // 撞到方块: 反弹衰减(位置留在原地)
      d.vy = -d.vy * 0.3; d.vx *= 0.55; d.vz *= 0.55
    } else {
      d.x = nx; d.y = ny; d.z = nz
    }
    const fade = Math.min(1, d.life / 0.3)   // 最后 0.3s 缩小消失
    // 像素尺寸 = 米制大小 × 投影换算(FOV 70°, 视口高 621 → 常数 443)
    const pos = wpos(d.x, d.y, d.z)
    const dist = Cesium.Cartesian3.distance(pos, viewer.camera.positionWC)
    const px = d.size * 443 / Math.max(dist, 0.6) * (0.45 + 0.55 * fade)
    d.e.billboard.width = px
    d.e.billboard.height = px
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
function destroyBlockAt(x, y, z) {
  const oldId = voxelAt(x, y, z)
  if (!oldId) return
  if (!setVoxelRaw(x, y, z, AIR)) return
  sfxBreak()
  spawnDebris(x, y, z, oldId)
  if (oldId === B.GLOW) removeGlowHalo(x, y, z)
  // 上方植物失去支撑 → 一并清除
  if (isPlant(voxelAt(x, y + 1, z))) setVoxelRaw(x, y + 1, z, AIR)
  rebuildChunkAt(x, z)
  // 上方沙子落下
  settleColumn(x, z, y + 1); rebuildChunkAt(x, z)
}
function destroyBlock() {   // 立即破坏准星指向的方块(调试/兼容)
  if (!viewer) return
  const ray = raycastVoxel(MAX_REACH)
  if (!ray) return
  destroyBlockAt(ray.hit[0], ray.hit[1], ray.hit[2])
}
function placeAtClick() {
  if (!viewer) return
  const item = currentItem()
  if (item && item.kind === 'item') { throwBall(); return } // 光球: 右键扔球
  if (!item) return                                        // 空手: 不放置
  const ray = raycastVoxel(MAX_REACH)
  if (!ray || !ray.place) return
  const [x, y, z] = ray.place
  if (Math.abs(x) >= WORLD_HALF - 1 || Math.abs(z) >= WORLD_HALF - 1 || y < 0 || y >= VOX_H) return
  const dstId = voxelAt(x, y, z)
  if (dstId && !isPlant(dstId)) return   // 植物可被直接替换
  if (playerIntersectsVoxel(x, y, z)) return // 不能把方块放进自己身体
  placeBlockVoxel(x, y, z, item.id)
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
  updatePlayer(dt); updateBalls(dt); updateCamera(); updateClouds(dt); updateLightUniforms(); updateInteraction(dt); updateDebris(dt)
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

/* ============ 背包界面 ============ */
function itemName(k) { return (ITEM_BY_KEY[k] && ITEM_BY_KEY[k].name) || '' }
function isHover(zone, i) { const h = hoverSlot.value; return !!h && h.zone === zone && h.index === i }
function pickFromBackpack(k) { hotbar.value[selectedSlot.value] = k }   // 点背包物品 → 放入当前选中格
function openInv() {
  if (invOpen.value || !viewer) return
  invOpen.value = true
  attackStop(); keys.clear()
  updateHighlight(null)
  if (document.pointerLockElement) document.exitPointerLock()   // 放开鼠标才能点面板
}
function closeInv() {
  if (!invOpen.value) return
  invOpen.value = false
  hoverSlot.value = null
  requestLock()   // E/ESC/点击都算用户手势, 可立即重新锁定
}
// 数字键: 悬停背包格 → 放入对应快捷栏格; 悬停快捷栏格 → 与之对调(MC 创造模式行为)
function hotbarKeyInto(n) {
  const h = hoverSlot.value
  if (!h || n < 0 || n >= HOTBAR_N) return
  const src = h.zone === 'bag' ? backpack.value[h.index] : hotbar.value[h.index]
  if (!src) return
  const old = hotbar.value[n]
  hotbar.value[n] = src
  if (h.zone === 'hot') hotbar.value[h.index] = old || null
}
// 数字键 → 快捷栏序号(1-9, 0 → 第 10 格)
function digitSlot(code) {
  if (code >= 'Digit1' && code <= 'Digit9') return parseInt(code[5]) - 1
  if (code === 'Digit0' && HOTBAR_N >= 10) return 9
  return -1
}
function onKeyDown(e) {
  if (e.code === 'KeyE' && !e.repeat) { invOpen.value ? closeInv() : openInv(); return }
  if (invOpen.value) {
    // 背包打开: 只处理关闭与数字键, 其余按键(含移动)全部屏蔽
    if (e.code === 'Escape') { closeInv(); return }
    const n = digitSlot(e.code)
    if (n >= 0) hotbarKeyInto(n)
    return
  }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
  keys.add(e.code)
  if (e.code === 'KeyC') toggleCam()
  if (e.code === 'KeyH') toggleUI()
  const n = digitSlot(e.code)
  if (n >= 0) selectedSlot.value = n
  // 双击空格切换飞行(创造模式)
  if (e.code === 'Space' && !e.repeat) {
    const now = performance.now()
    if (now - lastSpaceTap < 300) { flying.value = !flying.value; player.vy = 0; if (flying.value) keys.delete('Space') }
    lastSpaceTap = now
  }
}
function onKeyUp(e) { keys.delete(e.code) }
function onMouseMove(e) {
  if (invOpen.value) return   // 背包打开: 冻结视角
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
  if (invOpen.value) return   // 背包打开: 不切格
  const N = HOTBAR_N
  if (e.deltaY > 0) selectedSlot.value = (selectedSlot.value + 1) % N
  else selectedSlot.value = (selectedSlot.value + N - 1) % N
}
// 注意:必须用 pointer 事件 —— Cesium 在 pointerdown 上 preventDefault 会抑制 mousedown 的派发
function requestLock() {
  if (viewer && document.pointerLockElement !== viewer.canvas) {
    try { viewer.canvas.requestPointerLock() } catch (err) {}
  }
}
function onPointerDown(e) {
  if (!viewer || invOpen.value || e.target !== viewer.canvas) return // 只响应画布本身(背包打开时不交互)
  e.preventDefault()
  ensureAudio() // 用户手势后启用音频
  requestLock()
  const item = currentItem()
  if (item && item.kind === 'item') { throwBall(); return } // 光球: 左/右键都是扔球
  if (e.button === 0) attackStart()
  else if (e.button === 2) placeAtClick()
}
function onPointerUp(e) {
  if (e.button === 0) attackStop()
}
function onCanvasClick(e) {
  // 兜底:pointerdown 时的锁定请求可能被浏览器推迟到鼠标释放后
  if (!viewer || invOpen.value || e.target !== viewer.canvas) return
  requestLock()
}
function onCanvasContext(e) {
  if (!viewer || e.target !== viewer.canvas) return
  e.preventDefault()
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
  window.addEventListener('pointerdown', onPointerDown); window.addEventListener('pointerup', onPointerUp); window.addEventListener('click', onCanvasClick); window.addEventListener('contextmenu', onCanvasContext)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('pointerlockerror', onPointerLockError)
  buildCharacter(); setCamMode(camMode.value); initInteractionVisuals(); buildWorld(); initChunkRendering(); buildAllChunks(); buildCelestial(); buildClouds()
  // 出生点:放到地表(否则初始 y 会埋在基岩附近的地底)
  player.x = 0; player.z = 0; player.y = voxelGroundY(0, 0) + 0.2; player.vy = 0; player.yaw = -1.5 // 朝西(开阔谷地)
  applySun() // 初始化光照与天空颜色(与 sunHour 一致)
  lastTick = performance.now(); lastHudT = performance.now()
  const oldId = window.__intervalId; if (oldId) clearInterval(oldId)
  window.__intervalId = setInterval(tick, 16)
  // 自动昼夜循环
  window.__dayCycle = setInterval(() => { sunHour.value = (sunHour.value + 0.15) % 24; applySun() }, 3000)
  window.__engine = { viewer, player, tickCount: 0, voxelAt, setVoxelRaw, rebuildChunkAt, voxelGroundY, raycastVoxel, chunks, placeBlockVoxel, destroyBlock, destroyBlockAt, attackStart, attackStop, settleColumn, flying, groundYAt, surfaceYAt, caveAt, biomeAt, isPlant, glowLights, lightUniformSets, updateLightUniforms, ecefToVoxel, buildChunkGeometries, debrisTex, wpos, sunHour, get attacking() { return attacking }, get hlPrimitive() { return hlPrimitive },
    inv: { ITEMS, ITEM_BY_KEY, HOTBAR_N, hotbar, backpack, invOpen, hoverSlot, selectedSlot, currentItem, itemIcon, itemName, openInv, closeInv, pickFromBackpack, hotbarKeyInto, isHover, digitSlot } }
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
  window.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('pointerup', onPointerUp); window.removeEventListener('click', onCanvasClick); window.removeEventListener('contextmenu', onCanvasContext)
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
.slot { width: 48px; height: 48px; border-radius: 4px; cursor: pointer; border: 2px solid rgba(255,255,255,0.3); position: relative; background: rgba(0,0,0,0.32); display: flex; align-items: center; justify-content: center; }
.slot.empty { background: rgba(255,255,255,0.06); }
.slot.active { border-color: #fff; transform: scale(1.12); box-shadow: 0 0 10px rgba(255,255,255,0.5); }
.slot img, .islot img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; pointer-events: none; }
.slotNum { position: absolute; top: 1px; left: 3px; font-size: 10px; color: #fff; text-shadow: 0 0 3px #000; font-weight: 700; }

/* 背包面板 */
.inv-overlay { position: absolute; inset: 0; z-index: 30; background: rgba(6,10,18,0.5); display: flex; align-items: center; justify-content: center; }
.inv-panel { width: max-content; max-width: 96vw; background: rgba(16,21,34,0.96); border: 2px solid rgba(120,150,230,0.28); border-radius: 10px; padding: 12px 14px 10px; box-shadow: 0 16px 48px rgba(0,0,0,0.6); }
.inv-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.inv-title { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 1px; }
.inv-sub { font-size: 10px; color: rgba(255,255,255,0.4); }
.inv-close { margin-left: auto; background: rgba(255,255,255,0.08); border: none; color: #cfe0ff; font-size: 12px; border-radius: 6px; cursor: pointer; padding: 2px 8px; }
.inv-close:hover { background: rgba(255,255,255,0.18); }
.inv-label { font-size: 11px; color: #9fb6d8; margin: 8px 0 4px; }
.inv-tip { font-size: 10px; color: rgba(255,255,255,0.35); margin-left: 8px; }
.inv-grid { display: grid; grid-template-columns: repeat(9, 42px); gap: 3px; }
.inv-row { display: grid; grid-template-columns: repeat(10, 42px); gap: 3px; }
.islot { width: 42px; height: 42px; border-radius: 3px; background: rgba(255,255,255,0.06); border: 2px solid rgba(255,255,255,0.14); display: flex; align-items: center; justify-content: center; position: relative; cursor: pointer; }
.islot:hover, .islot.hover { border-color: #8fb0ff; background: rgba(120,160,255,0.18); }
.islot.active { border-color: #fff; box-shadow: 0 0 8px rgba(255,255,255,0.45); }
.islotNum { position: absolute; top: 0; left: 3px; font-size: 9px; color: rgba(255,255,255,0.5); }
.inv-hint { font-size: 10px; color: rgba(255,255,255,0.45); margin-top: 9px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); }
.inv-hint b { color: #aad0ff; }

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