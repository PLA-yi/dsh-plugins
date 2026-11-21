// 在插件后台起工作台用的小外壳：node run-workbench.mjs <工作台的 server.mjs> --port <端口>
// DSH 被强行关掉时，子进程不会跟着退出；这里每两秒看一眼，发现 DSH 已经不在了（父进程变了）就自己退出，免得占着端口。
const [, , server, ...rest] = process.argv
const parent = process.ppid
setInterval(() => { if (process.ppid !== parent) process.exit(0) }, 2000).unref()
process.argv = [process.argv[0], server, ...rest]
await import(new URL(`file://${server}`).href)
