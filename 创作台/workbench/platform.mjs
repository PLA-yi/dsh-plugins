// 和操作系统有关的几件事集中在这里：找 Chrome、跑命令、给命令行参数加引号、用系统默认方式打开文件。
// Mac 上的行为和原来一样；Windows 和 Linux 换成对应的写法。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WIN = process.platform === 'win32';
export const MAC = process.platform === 'darwin';

function firstExisting(list) {
  for (const p of list) if (p) { try { fs.accessSync(p); return p; } catch {} }
  return '';
}

/** Chrome（Windows 上没有 Chrome 时用 Edge）。环境变量 WB_CHROME 可以指定别的位置。 */
export const CHROME = process.env.WB_CHROME || (MAC
  ? firstExisting(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')])
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : WIN
    ? firstExisting([
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
    ]) || 'chrome.exe'
    : firstExisting(['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) || 'google-chrome');

/** 跑一行命令用的 shell 和参数。 */
export function shellArgs(cmd) {
  if (WIN) return ['cmd.exe', ['/d', '/s', '/c', `"${cmd}"`], { windowsVerbatimArguments: true }];
  return [MAC ? '/bin/zsh' : '/bin/sh', ['-lc', cmd], {}];
}

/** 给一个参数加上当前 shell 认的引号。 */
export const quote = s => WIN ? `"${String(s).replace(/"/g, '""')}"` : `'${String(s).replace(/'/g, `'\\''`)}'`;

/** 跑 .mjs 脚本用的 Node：就是工作台自己在用的这个（在 DeepSeek Harness 里是桌面版自带的）。 */
export const NODE = quote(process.execPath);

/**
 * 用系统默认方式打开文件、文件夹或网址的命令。
 * @param target 要打开的东西
 * @param how 'open' 直接打开 | 'reveal' 在文件夹里选中 | 'text' 用文本编辑器打开
 */
export function openCommand(target, how = 'open') {
  if (MAC) return how === 'reveal' ? `open -R ${quote(target)}` : how === 'text' ? `open -t ${quote(target)}` : `open ${quote(target)}`;
  if (WIN) {
    if (how === 'reveal') return `explorer /select,${quote(target)}`;
    if (how === 'text') return `notepad ${quote(target)}`;
    return `start "" ${quote(target)}`;
  }
  return `xdg-open ${quote(how === 'reveal' ? path.dirname(target) : target)}`;
}

/** openCommand 拆成 execFile 能直接用的命令和参数（不经过 shell）。 */
export function openArgs(target) {
  if (MAC) return ['open', [target]];
  if (WIN) return ['explorer', [target]];
  return ['xdg-open', [target]];
}

/** 本机文件的 file:// 地址（Windows 的盘符和反斜杠也处理好）。 */
export const fileUrl = p => (WIN ? 'file:///' : 'file://') + String(p).replace(/\\/g, '/');
