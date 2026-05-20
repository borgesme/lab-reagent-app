import { PALETTE_KEYS, PALETTE_STORAGE_KEY } from './palettes';

// 防 FOUC：hydration 前同步读 localStorage 设 data-palette。
// 字符串结果将通过 dangerouslySetInnerHTML 注入 <head>，
// 字符串字面量与 palettes.ts 始终保持一致。
export const PALETTE_NO_FLASH_SCRIPT = `(function(){try{var k=${JSON.stringify(
  PALETTE_STORAGE_KEY,
)};var p=localStorage.getItem(k);var w=${JSON.stringify(
  PALETTE_KEYS,
)};if(p&&w.indexOf(p)>=0){document.documentElement.dataset.palette=p;}}catch(e){}})();`;
