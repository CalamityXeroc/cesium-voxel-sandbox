# 体素沙盒 · Cesium Voxel Sandbox

基于 [Cesium](https://cesium.com/platform/cesiumjs/) 从零实现的**体素沙盒世界**（创造模式），
在三维地球坐标系中运行完整的体素引擎：地形生成、洞穴、光照、破坏与放置。

个人网站中的「引擎沙盒」页面（`/sandbox`）即以此为内容源。

## 功能

- **体素世界**：256 × 256 × 256 区块系统（`Uint8Array` 数据层 + 面剔除 meshing）
- **程序化地形**：fBm 多倍频噪声（大陆度 / 侵蚀 / 山峰谷地 / 山脊线）+ 3D 密度场
- **洞穴**：意面隧道 + 奶酪洞厅
- **真实光照**：自定义着色器，太阳方向光 + 萤石点光源逐像素计算
- **方块交互**：DDA 体素射线拾取，左键破坏 / 右键放置，沙子重力沉降
- **视角**：第一 / 第三人称切换（`C` 键），创造飞行（双击空格）
- **环境**：昼夜循环、方块云、天空渐变、程序化音效

## 操作

| 按键 | 功能 |
|---|---|
| `W A S D` | 移动 |
| `空格` | 跳跃 / 双击切换飞行 |
| `左键` | 破坏方块 |
| `右键` | 放置方块 |
| `1-9` / 滚轮 | 切换物品 |
| `C` | 切换第一 / 第三人称 |
| `H` | 隐藏 UI |
| `ESC` | 释放鼠标 |

## 开发

```bash
npm install       # 安装依赖
npm run dev       # 开发服务器 http://localhost:3100
npm run build     # 构建到 dist/
npm run preview   # 预览构建产物
```

首次运行 `dev` / `build` 前会自动执行 `scripts/copy-cesium-assets.mjs`，
把 Cesium 运行时资产（Workers / Assets / Widgets / ThirdParty）复制到 `public/cesium/`。

## 与个人网站的关系

- 本项目**独立开发、独立构建、独立部署**，与个人网站仓库互不引用源码。
- 个人网站的 `/sandbox` 路由通过 `iframe` 加载本项目：
  - 本地开发：指向 `http://localhost:3100`（需先启动本项目 dev server）
  - 线上：指向网站根目录下的 `/voxel/`（本项目构建产物部署位置）

## 部署

构建产物 `dist/` 整体上传到个人网站服务器的 `/voxel/` 目录即可，
其中包含 `assets/`（打包产物）与 `cesium/`（Cesium 运行时资产）。

## 技术栈

Vue 3 · Vite 2 · Cesium 1.144 · simplex-noise
