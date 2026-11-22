// 视频依赖装完后顺手装两个可选的 Python 工具：cmake（第一次转字幕时编译 whisper 要用）、yt-dlp（按链接下载 B 站、YouTube 等的视频）。
// 装不上不报错，只是这两样用不了，其他不受影响。
// macOS 没装开发者工具时，直接运行 python3 会弹窗让人装 Xcode 工具，所以先确认装了再调。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const say = s => console.log(`[视频工具] ${s}`);
const ok = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'ignore', timeout: 20000 }); return true; } catch { return false; } };
try {
  if (process.platform === 'darwin' && !ok('xcode-select', ['-p'])) { say('没装 Xcode 命令行工具，跳过 cmake、yt-dlp（转字幕和按链接下载会用不了）'); process.exit(0); }
  const py = ['python3.12', 'python3', 'python'].find(p => ok(p, ['--version']));
  if (!py) { say('没找到 Python，跳过 cmake、yt-dlp（转字幕和按链接下载会用不了）'); process.exit(0); }
  if (!fs.existsSync('py')) execFileSync(py, ['-m', 'venv', 'py'], { stdio: 'inherit', timeout: 120000 });
  const pip = process.platform === 'win32' ? 'py/Scripts/pip' : 'py/bin/pip';
  const mirror = process.env.WB_PIP_MIRROR ? ['-i', 'https://pypi.tuna.tsinghua.edu.cn/simple'] : [];
  execFileSync(pip, ['install', '-q', ...mirror, 'cmake', 'yt-dlp'], { stdio: 'inherit', timeout: 15 * 60000 });
  say('cmake、yt-dlp 装好了');
} catch (e) {
  say(`cmake / yt-dlp 没装上（${String(e.message).slice(0, 120)}）：转字幕和按链接下载会用不了，其他不受影响`);
}
