# Cesium Voxel Sandbox

用 [CesiumJS](https://cesium.com/platform/cesiumjs/) 从零实现的**体素沙盒游戏**（创造模式）——
在三维地球坐标系里跑一整套体素引擎：地形生成、生物群系、光照、破坏与放置。

> A Minecraft-style voxel sandbox built on CesiumJS.

## 特性

- **体素世界**：256 × 256 × 256，`Uint8Array` 数据层 + 面剔除 meshing + 环境光遮蔽（AO）
- **程序化地形**：fBm 噪声生成大陆度与缓坡地形，3D 密度场挖出洞穴（意面隧道 / 奶酪洞厅 / 露天洞穴）
- **四种生物群系**：草原 / 森林 / 沙漠 / 雪原，温度湿度双噪声气候场驱动，地表方块与树种随群系分化
- **植被**：橡树 / 白桦 / 云杉 / 仙人掌，草丛与红花黄花（十字交叉面 + alpha 裁剪渲染）
- **光照**：自定义着色器，太阳方向光 + 最多 8 盏萤石点光源逐像素计算，含昼夜循环
- **方块交互**：DDA 体素射线拾取，左键破坏（一击即碎，长按连挖）/ 右键放置，沙子重力沉降，破坏碎屑粒子
- **物品栏与背包**：按 `E` 打开，21 种物品无限取用，等轴测方块图标
- **视角**：第一 / 第三人称切换，创造模式飞行

## 操作

| 按键 | 功能 |
|---|---|
| `W A S D` | 移动 |
| `空格` | 跳跃 / 双击切换飞行 |
| `左键` | 破坏方块（可长按连挖） |
| `右键` | 放置方块 / 扔光球 |
| `1-9` `0` | 选择快捷栏物品 |
| `滚轮` | 切换物品 |
| `E` | 打开背包 |
| `C` | 切换第一 / 第三人称 |
| `H` | 隐藏界面 |
| `ESC` | 释放鼠标 |

## 运行

```bash
npm install
npm run dev      # 开发服务器 http://localhost:3100
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
```

首次运行 `dev` / `build` 前会自动执行 `scripts/copy-cesium-assets.mjs`，
把 Cesium 运行时资产（Workers / Assets / Widgets / ThirdParty）复制到 `public/cesium/`。

## 技术栈

Vue 3 · Vite 2 · CesiumJS 1.14x · simplex-noise

## 许可

MIT
