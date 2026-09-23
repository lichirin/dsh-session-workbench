// 还原被隔离的旧会话：把 quarantine/ 里的会话按原路径移回 sessions/。
// 用法: node restore.mjs [--dry-run]
import { readFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'))
const dryRun = process.argv.includes('--dry-run')

let done = 0, skipped = 0
for (const mv of manifest.moves) {
  if (!existsSync(mv.to)) { console.log('  源不存在,跳过:', mv.sessionId); skipped++; continue }
  if (existsSync(mv.from)) { console.log('  目标已存在,跳过:', mv.sessionId); skipped++; continue }
  if (dryRun) { console.log('  [dry-run] 将还原:', mv.sessionId, mv.title ? '(' + String(mv.title).slice(0, 40) + ')' : ''); done++; continue }
  mkdirSync(dirname(mv.from), { recursive: true })
  renameSync(mv.to, mv.from)
  done++
}
console.log((dryRun ? '[dry-run] 可还原 ' : '已还原 ') + done + ' / ' + manifest.count + '，跳过 ' + skipped)
