/**
 * 将 Cesium 的运行时资产(Workers / Assets / ThirdParty / Widgets)
 * 从 node_modules 复制到 public/cesium,供 window.CESIUM_BASE_URL 使用。
 * 用法:node scripts/copy-cesium-assets.mjs
 */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const srcBase = join(projectRoot, 'node_modules', 'cesium', 'Build', 'Cesium');
const destBase = join(projectRoot, 'public', 'cesium');

const dirs = ['Assets', 'ThirdParty', 'Widgets', 'Workers'];

if (!existsSync(join(srcBase, 'Workers'))) {
  console.error('[cesium:assets] 未找到 node_modules/cesium/Build/Cesium,请先 npm install');
  process.exit(1);
}

mkdirSync(destBase, { recursive: true });

for (const d of dirs) {
  const src = join(srcBase, d);
  const dest = join(destBase, d);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[cesium:assets] ${d} -> public/cesium/${d}`);
}

console.log('[cesium:assets] 完成,静态资源已就绪');