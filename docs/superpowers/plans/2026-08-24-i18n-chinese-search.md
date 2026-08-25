# i18n-ally-search 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个零运行时依赖的 VS Code 插件：输入中文子串 -> 反查语言包 key -> 全局定位代码中该 key 的引用，支持 QuickPick 跳转与转接原生搜索面板两种交互。

**Architecture:** 语言包反向索引（懒加载 + FileSystemWatcher 防抖重建）+ 按需 `vscode.workspace.findTextInFiles`（内置 ripgrep）搜带引号的 key。解析器接口可插拔（MVP 只有 JSON）。规格见 `docs/superpowers/specs/2026-08-24-i18n-ally-search-design.md`。

**Tech Stack:** TypeScript、VS Code Extension API（engines ^1.75）、mocha + @vscode/test-electron（测试跑在真实 VS Code 扩展宿主里）、tsc 直出（零运行时依赖，不需要 esbuild 打包）。

**约定（所有任务通用）：**

- 测试断言用 node 内置 `assert`（`import * as assert from 'assert'`），mocha 使用 tdd 风格（`suite`/`test`）。
- 每个任务结束都要 `npm test` 全绿再提交。
- `npm test` = 编译 + `node ./out/src/test/runTest.js`。首次运行会下载独立 VS Code 实例（约 150MB），属正常现象。
- 命令都在仓库根目录 `E:\work\i18n-global-chinese-search` 下执行。插件代码全部放在仓库根目录（本仓库目前只有 docs/，插件就是仓库主体）。

---

### Task 1: 脚手架与测试基建

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.vscodeignore`
- Create: `src/extension.ts`（占位）
- Create: `src/test/runTest.ts`
- Create: `src/test/index.ts`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "i18n-ally-search",
  "displayName": "i18n Chinese Search",
  "publisher": "i18n-ally-search",
  "description": "通过中文一步定位 i18n key 在代码中的引用位置（vue-i18n 等）",
  "version": "0.0.1",
  "engines": { "vscode": "^1.75.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/src/extension.js",
  "contributes": {
    "commands": [
      { "command": "i18nSearch.searchByChinese", "title": "通过中文搜索代码", "category": "i18n" },
      { "command": "i18nSearch.searchByChineseInPanel", "title": "通过中文搜索代码（原生搜索面板）", "category": "i18n" }
    ],
    "configuration": {
      "title": "i18n Chinese Search",
      "properties": {
        "i18nSearch.localePaths": {
          "type": "array",
          "items": { "type": "string" },
          "default": [],
          "description": "中文语言包路径 glob 数组，如 [\"src/locales/**/zh-CN.json\"]。也容忍逗号分隔的字符串。"
        },
        "i18nSearch.keyStyle": {
          "type": "string",
          "enum": ["auto", "nested", "flat"],
          "default": "auto",
          "description": "语言包 key 结构：nested 嵌套对象，flat 扁平点路径，auto 自动判断"
        },
        "i18nSearch.include": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["**/*.{vue,ts,js,tsx,jsx}"],
          "description": "代码引用搜索的文件 glob 范围"
        },
        "i18nSearch.maxReferences": {
          "type": "number",
          "default": 200,
          "description": "引用结果条数上限"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -p ./ --watch",
    "test": "npm run compile && node ./out/src/test/runTest.js"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/node": "^18.19.0",
    "@types/vscode": "^1.75.0",
    "@vscode/test-electron": "^2.4.0",
    "mocha": "^10.4.0",
    "typescript": "^5.4.5"
  }
}
```

注意：`commands`/`configuration` 现在就写全，后面任务只写实现代码，不再改贡献点。

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "out",
    "sourceMap": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

零运行时依赖，所以 tsc 直出即可运行，不需要 esbuild。

- [ ] **Step 3: 写 .gitignore 与 .vscodeignore**

`.gitignore`:

```
node_modules/
out/
.vscode-test/
*.vsix
```

`.vscodeignore`:

```
.vscode/**
src/**
test-fixtures/**
node_modules/**
out/src/test/**
out/**/*.map
docs/**
.claude/**
```

- [ ] **Step 4: 写占位 src/extension.ts**

```typescript
export function activate(): void {
  // 后续任务实现命令注册与 watcher
}

export function deactivate(): void {
  // nothing
}
```

- [ ] **Step 5: 写测试启动器 src/test/runTest.ts**

```typescript
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // 插件目录 = 仓库根；测试工作区 = test-fixtures（Task 5 创建，先容忍不存在则用默认空窗口）
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'index');
    const workspacePath = path.resolve(__dirname, '../../../test-fixtures');
    const launchArgs = require('fs').existsSync(workspacePath) ? [workspacePath] : [];
    await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 6: 写测试加载器 src/test/index.ts（不引入 glob 依赖，手写递归扫描）**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as Mocha from 'mocha';

function findTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTestFiles(p));
    } else if (entry.name.endsWith('.test.js')) {
      out.push(p);
    }
  }
  return out;
}

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  for (const file of findTestFiles(__dirname)) {
    mocha.addFile(file);
  }
  await new Promise<void>((resolve, reject) => {
    mocha.run(failures => (failures > 0 ? reject(new Error(`${failures} 个测试失败`)) : resolve()));
  });
}
```

- [ ] **Step 7: 安装依赖并编译**

Run: `npm install && npm run compile`
Expected: 无报错，生成 `out/src/extension.js`、`out/src/test/runTest.js`、`out/src/test/index.js`。

- [ ] **Step 8: 跑空测试验证基建**

Run: `npm test`
Expected: 下载 VS Code 后 mocha 报 `0 passing`，进程退出码 0。

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .vscodeignore src/
git commit -m "chore: 插件脚手架与 mocha 测试基建"
```

---

### Task 2: flatten 纯函数（TDD）

**Files:**
- Create: `src/locale/flatten.ts`
- Test: `src/test/flatten.test.ts`

- [ ] **Step 1: 写失败测试 src/test/flatten.test.ts**

```typescript
import * as assert from 'assert';
import { flattenLocale } from '../locale/flatten';

suite('flattenLocale', () => {
  test('nested 拍平为点路径', () => {
    assert.deepStrictEqual(flattenLocale({ user: { name: '用户名' } }, 'nested'), [
      { key: 'user.name', value: '用户名' },
    ]);
  });

  test('深层嵌套逐级拼接', () => {
    assert.deepStrictEqual(flattenLocale({ a: { b: { c: '深' } } }, 'nested'), [
      { key: 'a.b.c', value: '深' },
    ]);
  });

  test('flat 模式直接取顶层字符串 key', () => {
    assert.deepStrictEqual(
      flattenLocale({ 'user.name': '用户名', 'common.confirm': '确认' }, 'flat'),
      [
        { key: 'user.name', value: '用户名' },
        { key: 'common.confirm', value: '确认' },
      ],
    );
  });

  test('auto：顶层存在「key 含点且值为字符串」判为 flat', () => {
    assert.deepStrictEqual(flattenLocale({ 'user.name': '用户名' }, 'auto'), [
      { key: 'user.name', value: '用户名' },
    ]);
  });

  test('auto：否则判为 nested', () => {
    assert.deepStrictEqual(flattenLocale({ user: { name: 'x' } }, 'auto'), [
      { key: 'user.name', value: 'x' },
    ]);
  });

  test('nested 模式下含点的对象 key 按路径拼接（vue-i18n 等价语义）', () => {
    assert.deepStrictEqual(flattenLocale({ 'user.name': { placeholder: '占位' } }, 'nested'), [
      { key: 'user.name.placeholder', value: '占位' },
    ]);
  });

  test('数组值跳过', () => {
    assert.deepStrictEqual(flattenLocale({ list: ['a', 'b'], ok: '好' }, 'nested'), [
      { key: 'ok', value: '好' },
    ]);
  });

  test('非字符串叶子跳过', () => {
    assert.deepStrictEqual(flattenLocale({ n: 1, ok: '好' }, 'nested'), [
      { key: 'ok', value: '好' },
    ]);
  });

  test('flat 模式下非字符串顶层值跳过', () => {
    assert.deepStrictEqual(flattenLocale({ 'a.b': 'x', other: { c: 'y' } }, 'flat'), [
      { key: 'a.b', value: 'x' },
    ]);
  });

  test('空对象返回空数组', () => {
    assert.deepStrictEqual(flattenLocale({}, 'auto'), []);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 编译报错 `Cannot find module '../locale/flatten'`（或测试加载失败）。这是预期的失败。

- [ ] **Step 3: 写实现 src/locale/flatten.ts**

```typescript
export interface LocaleEntry {
  key: string;
  value: string;
}

export type KeyStyle = 'nested' | 'flat' | 'auto';

export function flattenLocale(obj: Record<string, unknown>, style: KeyStyle = 'auto'): LocaleEntry[] {
  const resolved = style === 'auto' ? detectKeyStyle(obj) : style;
  if (resolved === 'flat') {
    return Object.entries(obj)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => ({ key: k, value: v as string }));
  }
  const out: LocaleEntry[] = [];
  walk(obj, '', out);
  return out;
}

/** auto 启发式：顶层存在「key 含 . 且值为字符串」即视为扁平结构 */
function detectKeyStyle(obj: Record<string, unknown>): KeyStyle {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && k.includes('.')) {
      return 'flat';
    }
  }
  return 'nested';
}

function walk(node: Record<string, unknown>, prefix: string, out: LocaleEntry[]): void {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out.push({ key, value: v });
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      walk(v as Record<string, unknown>, key, out);
    }
    // 数组、number、boolean、null 等非文案叶子一律跳过
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: flatten 的 10 个测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/locale/flatten.ts src/test/flatten.test.ts
git commit -m "feat: 语言包对象拍平（nested/flat/auto）"
```

---

### Task 3: 解析器注册表与 JsonParser（TDD）

**Files:**
- Create: `src/locale/parser.ts`
- Create: `src/locale/jsonParser.ts`
- Test: `src/test/parser.test.ts`

- [ ] **Step 1: 写失败测试 src/test/parser.test.ts**

```typescript
import * as assert from 'assert';
import { jsonParser } from '../locale/jsonParser';
import { getParserForFile } from '../locale/parser';

suite('locale parsers', () => {
  test('jsonParser 解析 JSON 文本', async () => {
    assert.deepStrictEqual(await jsonParser.parse('{"a":"b"}'), { a: 'b' });
  });

  test('jsonParser 拒绝非法 JSON', async () => {
    await assert.rejects(() => jsonParser.parse('{ broken'));
  });

  test('jsonParser 识别 .json 扩展名', () => {
    assert.strictEqual(jsonParser.supports('.json'), true);
    assert.strictEqual(jsonParser.supports('.yaml'), false);
  });

  test('注册表按文件路径查找解析器', () => {
    assert.strictEqual(getParserForFile('C:/proj/src/locales/zh-CN.json')?.id, 'json');
    assert.strictEqual(getParserForFile('locales/zh-CN.yaml'), undefined);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 编译报错找不到 `../locale/jsonParser` / `../locale/parser`。

- [ ] **Step 3: 写实现**

`src/locale/parser.ts`（接口 + 注册表 + 查找；末尾注册 JsonParser，jsonParser 对 parser.ts 只有 type-only import，编译后无运行时循环依赖）：

```typescript
import { jsonParser } from './jsonParser';

export interface LocaleFileParser {
  id: string;
  supports(ext: string): boolean;
  parse(text: string): Promise<Record<string, unknown>>;
}

const registry: LocaleFileParser[] = [];

export function getParserForFile(filePath: string): LocaleFileParser | undefined {
  const dot = filePath.lastIndexOf('.');
  const ext = dot === -1 ? '' : filePath.slice(dot);
  return registry.find(p => p.supports(ext));
}

// 注册内置解析器（将来加 JSON5/YAML 时在此追加）
registry.push(jsonParser);
```

`src/locale/jsonParser.ts`:

```typescript
import type { LocaleFileParser } from './parser';

export const jsonParser: LocaleFileParser = {
  id: 'json',
  supports: ext => ext === '.json',
  async parse(text: string): Promise<Record<string, unknown>> {
    return JSON.parse(text) as Record<string, unknown>;
  },
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: parser 的 4 个测试 PASS（flatten 的也保持 PASS）。

- [ ] **Step 5: Commit**

```bash
git add src/locale/parser.ts src/locale/jsonParser.ts src/test/parser.test.ts
git commit -m "feat: 可插拔语言包解析器接口与 JSON 实现"
```

---

### Task 4: 配置读取与路径规范化（TDD）

**Files:**
- Create: `src/config.ts`
- Test: `src/test/config.test.ts`

- [ ] **Step 1: 写失败测试 src/test/config.test.ts**

```typescript
import * as assert from 'assert';
import { normalizePaths } from '../config';

suite('normalizePaths', () => {
  test('数组：trim 尾斜杠、反斜杠转正斜杠', () => {
    assert.deepStrictEqual(normalizePaths(['src/locales/', 'b\\c', 'a//']), [
      'src/locales',
      'b/c',
      'a',
    ]);
  });

  test('逗号分隔字符串', () => {
    assert.deepStrictEqual(normalizePaths('a, b ,,c'), ['a', 'b', 'c']);
  });

  test('空串与空白项被过滤', () => {
    assert.deepStrictEqual(normalizePaths(['', '  ', 'ok']), ['ok']);
  });

  test('非字符串项被过滤', () => {
    assert.deepStrictEqual(normalizePaths([1, 'ok', null]), ['ok']);
  });

  test('undefined 返回空数组', () => {
    assert.deepStrictEqual(normalizePaths(undefined), []);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 编译报错找不到 `../config`。

- [ ] **Step 3: 写实现 src/config.ts**

```typescript
import * as vscode from 'vscode';
import type { KeyStyle } from './locale/flatten';

export interface ExtensionConfig {
  localePaths: string[];
  keyStyle: KeyStyle;
  include: string[];
  maxReferences: number;
}

/** 规范化路径列表：接受数组或逗号分隔字符串；trim、去尾斜杠、统一正斜杠（借鉴 i18n Ally） */
export function normalizePaths(input: unknown): string[] {
  let list: unknown[];
  if (typeof input === 'string') {
    list = input.split(',');
  } else if (Array.isArray(input)) {
    list = input;
  } else {
    list = [];
  }
  return list
    .filter((p): p is string => typeof p === 'string')
    .map(p => p.trim().replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter(p => p.length > 0);
}

export function loadConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('i18nSearch');
  const keyStyle = cfg.get<KeyStyle>('keyStyle');
  return {
    localePaths: normalizePaths(cfg.get('localePaths')),
    keyStyle: keyStyle === 'nested' || keyStyle === 'flat' ? keyStyle : 'auto',
    include: normalizePaths(cfg.get('include')).length > 0
      ? normalizePaths(cfg.get('include'))
      : ['**/*.{vue,ts,js,tsx,jsx}'],
    maxReferences: cfg.get<number>('maxReferences') ?? 200,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: config 的 5 个测试 PASS（运行在扩展宿主里，`loadConfig` 不报错即可，其行为由 Task 6 集成测试覆盖）。

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/test/config.test.ts
git commit -m "feat: 配置读取与路径规范化"
```

---

### Task 5: fixture 测试工作区

**Files:**
- Create: `test-fixtures/.vscode/settings.json`
- Create: `test-fixtures/locales/zh-CN.json`
- Create: `test-fixtures/locales/broken.json`
- Create: `test-fixtures/src/demo.vue`
- Create: `test-fixtures/src/demo.ts`

- [ ] **Step 1: 创建语言包与配置**

`test-fixtures/.vscode/settings.json`:

```json
{
  "i18nSearch.localePaths": ["locales/**/*.json"],
  "i18nSearch.include": ["**/*.vue", "**/*.ts"]
}
```

`test-fixtures/locales/zh-CN.json`（嵌套结构，含一个含点的对象 key）:

```json
{
  "user": {
    "name": "用户名",
    "profile": { "title": "个人中心" }
  },
  "login": { "usernamePlaceholder": "请输入用户名" },
  "common": { "confirm": "确认", "cancel": "取消" },
  "special.key": { "hello": "特殊键" }
}
```

`test-fixtures/locales/broken.json`（故意坏掉，测错误隔离）:

```json
{ "oops": 
```

- [ ] **Step 2: 创建代码引用文件**

`test-fixtures/src/demo.vue`:

```vue
<template>
  <div>{{ $t('user.name') }}</div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const title = t('user.profile.title');
</script>
```

`test-fixtures/src/demo.ts`:

```typescript
import i18n from './i18n';
export const cancelLabel = i18n.global.t("common.cancel");
```

- [ ] **Step 3: 验证 fixture 工作区被测试打开**

Run: `npm test`
Expected: 依然全绿（0 个测试受影响，runTest 现在会把 test-fixtures 作为工作区打开）。

- [ ] **Step 4: Commit**

```bash
git add test-fixtures/
git commit -m "test: fixture 工作区（语言包+引用代码+坏 JSON）"
```

---

### Task 6: LocaleIndex 反向索引（TDD）

**Files:**
- Create: `src/locale/localeIndex.ts`
- Test: `src/test/localeIndex.test.ts`（matchEntries 纯函数单测）
- Test: `src/test/integration.test.ts`（build/search 走 fixture 工作区）

- [ ] **Step 1: 写失败测试 src/test/localeIndex.test.ts**

```typescript
import * as assert from 'assert';
import { matchEntries, IndexedEntry } from '../locale/localeIndex';

const entries: IndexedEntry[] = [
  { key: 'user.name', value: '用户名', filePath: 'locales/zh-CN.json' },
  { key: 'login.usernamePlaceholder', value: '请输入用户名', filePath: 'locales/zh-CN.json' },
  { key: 'common.confirm', value: '确认', filePath: 'locales/zh-CN.json' },
];

suite('matchEntries（中文子串匹配）', () => {
  test('子串命中多条', () => {
    assert.deepStrictEqual(matchEntries(entries, '用户').map(e => e.key), [
      'user.name',
      'login.usernamePlaceholder',
    ]);
  });

  test('精确整词也命中', () => {
    assert.deepStrictEqual(matchEntries(entries, '确认').map(e => e.key), ['common.confirm']);
  });

  test('空查询返回空', () => {
    assert.deepStrictEqual(matchEntries(entries, ''), []);
    assert.deepStrictEqual(matchEntries(entries, '   '), []);
  });

  test('无命中返回空', () => {
    assert.deepStrictEqual(matchEntries(entries, '不存在的文案'), []);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 编译报错找不到 `../locale/localeIndex`。

- [ ] **Step 3: 写实现 src/locale/localeIndex.ts**

```typescript
import * as vscode from 'vscode';
import { LocaleEntry, KeyStyle, flattenLocale } from './flatten';
import { getParserForFile } from './parser';
import { ExtensionConfig } from '../config';

export interface IndexedEntry extends LocaleEntry {
  /** 展示用相对路径 */
  filePath: string;
}

export interface BuildFailure {
  file: string;
  message: string;
}

export interface BuildReport {
  filesLoaded: number;
  entries: number;
  failures: BuildFailure[];
}

/** 中文子串匹配（纯函数，便于单测） */
export function matchEntries(entries: IndexedEntry[], query: string): IndexedEntry[] {
  const q = query.trim();
  if (!q) {
    return [];
  }
  return entries.filter(e => e.value.includes(q));
}

export class LocaleIndex {
  private entries: IndexedEntry[] = [];
  private report: BuildReport = { filesLoaded: 0, entries: 0, failures: [] };
  private built = false;
  private configSig = '';
  private building: Promise<void> = Promise.resolve();

  allEntries(): IndexedEntry[] {
    return this.entries;
  }

  get lastBuildReport(): BuildReport {
    return this.report;
  }

  search(substring: string): IndexedEntry[] {
    return matchEntries(this.entries, substring);
  }

  /** 标记索引失效，下次 ensure 强制重建（配置变更时用） */
  invalidate(): void {
    this.built = false;
  }

  /** 首次使用或配置变化时构建；已在构建中则等待同一轮 */
  ensure(config: ExtensionConfig): Promise<BuildReport> {
    const sig = JSON.stringify([config.localePaths, config.keyStyle]);
    if (this.built && sig === this.configSig) {
      return this.building.then(() => this.report);
    }
    return this.build(config);
  }

  async build(config: ExtensionConfig): Promise<BuildReport> {
    this.building = this.doBuild(config).then(result => {
      this.entries = result.entries;
      this.report = result.report;
      return result.report;
    });
    const report = await this.building;
    this.built = true;
    this.configSig = JSON.stringify([config.localePaths, config.keyStyle]);
    return report;
  }

  private async doBuild(config: ExtensionConfig): Promise<{ report: BuildReport; entries: IndexedEntry[] }> {
    const failures: BuildFailure[] = [];
    const entries: IndexedEntry[] = [];
    let filesLoaded = 0;

    for (const glob of config.localePaths) {
      let uris: vscode.Uri[];
      try {
        uris = await vscode.workspace.findFiles(glob, '**/node_modules/**');
      } catch (err) {
        failures.push({ file: glob, message: `无效的 glob：${err instanceof Error ? err.message : String(err)}` });
        continue;
      }
      for (const uri of uris) {
        const parser = getParserForFile(uri.fsPath);
        if (!parser) {
          failures.push({ file: vscode.workspace.asRelativePath(uri), message: '不支持的文件格式' });
          continue;
        }
        try {
          const raw = await vscode.workspace.fs.readFile(uri);
          const text = new TextDecoder('utf-8').decode(raw);
          const obj = await parser.parse(text);
          for (const e of flattenLocale(obj, config.keyStyle)) {
            entries.push({ ...e, filePath: vscode.workspace.asRelativePath(uri) });
          }
          filesLoaded++;
        } catch (err) {
          // 单个文件坏掉不拖垮整体索引
          failures.push({
            file: vscode.workspace.asRelativePath(uri),
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return { report: { filesLoaded, entries: entries.length, failures }, entries };
  }
}
```

- [ ] **Step 4: 写集成测试 src/test/integration.test.ts（走 fixture 工作区）**

```typescript
import * as assert from 'assert';
import { LocaleIndex } from '../locale/localeIndex';
import { loadConfig } from '../config';

suite('integration: LocaleIndex 构建（fixture 工作区）', () => {
  test('加载语言包、跳过坏文件、建立反向索引', async () => {
    const index = new LocaleIndex();
    const report = await index.build(loadConfig());

    // broken.json 解析失败但 zh-CN.json 正常加载
    assert.strictEqual(report.filesLoaded, 1);
    assert.strictEqual(report.failures.length, 1);
    assert.ok(report.failures[0].file.includes('broken.json'));

    const hits = index.search('用户');
    assert.deepStrictEqual(hits.map(h => h.key), ['user.name', 'login.usernamePlaceholder']);

    const exact = index.search('特殊键');
    assert.strictEqual(exact.length, 1);
    assert.strictEqual(exact[0].key, 'special.key.hello');
  });

  test('ensure 幂等：同配置不重建', async () => {
    const index = new LocaleIndex();
    await index.build(loadConfig());
    const before = index.lastBuildReport;
    await index.ensure(loadConfig());
    assert.strictEqual(index.lastBuildReport, before); // 同一 report 引用，未重建
  });

  test('invalidate 后 ensure 重建', async () => {
    const index = new LocaleIndex();
    await index.build(loadConfig());
    index.invalidate();
    await index.ensure(loadConfig());
    assert.notStrictEqual(index.lastBuildReport, { filesLoaded: 0, entries: 0, failures: [] });
    assert.strictEqual(index.lastBuildReport.filesLoaded, 1);
  });
});
```

- [ ] **Step 5: 跑测试确认全部通过**

Run: `npm test`
Expected: matchEntries 4 个 + integration 3 个全部 PASS，之前的也保持 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/locale/localeIndex.ts src/test/localeIndex.test.ts src/test/integration.test.ts
git commit -m "feat: 语言包反向索引（懒构建/坏文件隔离/幂等 ensure）"
```

---

### Task 7: KeyReferenceFinder（TDD）

**Files:**
- Create: `src/search/referenceFinder.ts`
- Test: `src/test/referenceFinder.test.ts`
- Modify: `src/test/integration.test.ts`（追加引用搜索集成测试）

- [ ] **Step 1: 写失败测试 src/test/referenceFinder.test.ts（纯函数部分）**

```typescript
import * as assert from 'assert';
import { escapeRegex, buildKeySearchPattern, includePattern } from '../search/referenceFinder';

suite('regex helpers', () => {
  test('转义正则特殊字符', () => {
    assert.strictEqual(escapeRegex('user.name'), 'user\\.name');
    assert.strictEqual(escapeRegex('a+b(c)'), 'a\\+b\\(c\\)');
  });

  test('生成带引号的 key 匹配模式', () => {
    assert.strictEqual(buildKeySearchPattern('user.name'), "['\"`]user\\.name['\"`]");
  });

  test('模式命中三种引号与多种调用形态', () => {
    const re = new RegExp(buildKeySearchPattern('user.name'));
    assert.ok(re.test(`$t('user.name')`));
    assert.ok(re.test('t("user.name")'));
    assert.ok(re.test('$t(`user.name`)'));
    assert.ok(re.test(`v-t="'user.name'"`));
    assert.ok(!re.test('$t(user.name)'));        // 无引号不命中
    assert.ok(!re.test('$t(\'user.nameX\')'));   // 后缀不同不命中
  });

  test('include 多个 glob 合并为花括号', () => {
    assert.strictEqual(includePattern(['**/*.vue', '**/*.ts']), '{**/*.vue,**/*.ts}');
    assert.strictEqual(includePattern(['**/*.{vue,ts}']), '**/*.{vue,ts}');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 编译报错找不到 `../search/referenceFinder`。

- [ ] **Step 3: 写实现 src/search/referenceFinder.ts**

```typescript
import * as vscode from 'vscode';

export interface KeyReference {
  uri: vscode.Uri;
  range: vscode.Range;
  /** 命中行的原文（做预览） */
  lineText: string;
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 带引号的 key 匹配模式：命中 $t('k') / t("k") / $t(`k`) / v-t="'k'" / 裸字符串 */
export function buildKeySearchPattern(key: string): string {
  return `['"\`]${escapeRegex(key)}['"\`]`;
}

export function includePattern(include: string[]): string {
  return include.length === 1 ? include[0] : `{${include.join(',')}}`;
}

export async function findKeyReferences(key: string, include: string[], maxResults: number): Promise<KeyReference[]> {
  // 优先用官方 API（内置 ripgrep，尊重 search.exclude）；
  // API 不存在（老版本 VS Code）或抛错时退化为逐文件扫描。
  if (typeof vscode.workspace.findTextInFiles === 'function') {
    try {
      return await findByApi(key, include, maxResults);
    } catch {
      // fallthrough
    }
  }
  return findByFileScan(key, include, maxResults);
}

async function findByApi(key: string, include: string[], maxResults: number): Promise<KeyReference[]> {
  const out: KeyReference[] = [];
  await vscode.workspace.findTextInFiles(
    { pattern: buildKeySearchPattern(key), isRegex: true, isCaseSensitive: true },
    { include: includePattern(include), maxResults },
    (result: vscode.TextSearchResult) => {
      const match = result as vscode.TextSearchMatch;
      const range = Array.isArray(match.ranges) ? match.ranges[0] : match.ranges;
      if (range) {
        out.push({ uri: match.uri, range, lineText: match.preview.text });
      }
    },
  );
  return out;
}

async function findByFileScan(key: string, include: string[], maxResults: number): Promise<KeyReference[]> {
  const regex = new RegExp(buildKeySearchPattern(key));
  const uris = await vscode.workspace.findFiles(includePattern(include), '**/node_modules/**');
  const out: KeyReference[] = [];
  for (const uri of uris) {
    if (out.length >= maxResults) {
      break;
    }
    const raw = await vscode.workspace.fs.readFile(uri);
    const lines = new TextDecoder('utf-8').decode(raw).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = regex.exec(lines[i]);
      if (m) {
        out.push({ uri, range: new vscode.Range(i, m.index, i, m.index + m[0].length), lineText: lines[i] });
        if (out.length >= maxResults) {
          break;
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: 跑纯函数测试确认通过**

Run: `npm test`
Expected: regex helpers 4 个测试 PASS。

- [ ] **Step 5: 在 src/test/integration.test.ts 末尾追加引用搜索集成测试**

```typescript
import { findKeyReferences } from '../search/referenceFinder';

suite('integration: 代码引用搜索（fixture 工作区）', () => {
  test('vue 模板与 script 中的引用都能定位', async () => {
    const refs = await findKeyReferences('user.name', ['**/*.vue', '**/*.ts'], 200);
    assert.strictEqual(refs.length, 1);
    assert.ok(refs[0].uri.fsPath.replace(/\\/g, '/').endsWith('test-fixtures/src/demo.vue'));
    assert.strictEqual(refs[0].range.start.line, 1); // <div>{{ $t('user.name') }}</div>
    assert.ok(refs[0].lineText.includes("$t('user.name')"));
  });

  test('ts 文件双引号引用也能定位', async () => {
    const refs = await findKeyReferences('common.cancel', ['**/*.vue', '**/*.ts'], 200);
    assert.strictEqual(refs.length, 1);
    assert.ok(refs[0].uri.fsPath.replace(/\\/g, '/').endsWith('test-fixtures/src/demo.ts'));
  });

  test('无引用返回空数组', async () => {
    const refs = await findKeyReferences('not.used.key', ['**/*.vue', '**/*.ts'], 200);
    assert.deepStrictEqual(refs, []);
  });
});
```

注意：`import { findKeyReferences } ...` 放到文件顶部与其它 import 合并，`suite` 追加到文件末尾。

- [ ] **Step 6: 跑全部测试确认通过**

Run: `npm test`
Expected: integration 引用搜索 3 个测试 PASS（若 `findTextInFiles` 在测试环境异常，会走 fallback 路径，断言不受影响）。

- [ ] **Step 7: Commit**

```bash
git add src/search/referenceFinder.ts src/test/referenceFinder.test.ts src/test/integration.test.ts
git commit -m "feat: key 代码引用搜索（findTextInFiles + 逐文件退化方案）"
```

---

### Task 8: 两个搜索命令与 QuickPick 交互

**Files:**
- Create: `src/commands/searchByChinese.ts`

QuickPick 交互无法可靠自动化测试，本任务以编译通过 + Task 9 的激活测试（命令已注册）+ 手动验收（Task 10）验证。

- [ ] **Step 1: 写 src/commands/searchByChinese.ts 完整实现**

```typescript
import * as vscode from 'vscode';
import { LocaleIndex, IndexedEntry, matchEntries } from '../locale/localeIndex';
import { loadConfig } from '../config';
import { KeyReference, buildKeySearchPattern, findKeyReferences } from '../search/referenceFinder';

export function registerCommands(context: vscode.ExtensionContext, index: LocaleIndex): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('i18nSearch.searchByChinese', () => runSearch(index, false)),
    vscode.commands.registerCommand('i18nSearch.searchByChineseInPanel', () => runSearch(index, true)),
  );
}

async function runSearch(index: LocaleIndex, usePanel: boolean): Promise<void> {
  const config = loadConfig();

  if (vscode.workspace.workspaceFolders === undefined || vscode.workspace.workspaceFolders.length === 0) {
    void vscode.window.showWarningMessage('i18n Chinese Search 需要在工作区中使用');
    return;
  }
  if (config.localePaths.length === 0) {
    const pick = await vscode.window.showWarningMessage(
      '请先配置 i18nSearch.localePaths（中文语言包 glob 数组，如 ["src/locales/**/zh-CN.json"]）',
      '打开设置',
    );
    if (pick === '打开设置') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'i18nSearch.localePaths');
    }
    return;
  }

  const report = await index.ensure(config);
  for (const failure of report.failures) {
    void vscode.window.showWarningMessage(`语言包加载失败：${failure.file}（${failure.message}）`);
  }
  if (report.filesLoaded === 0) {
    void vscode.window.showWarningMessage(
      `localePaths 未匹配到任何可加载的语言包文件：${config.localePaths.join(', ')}`,
    );
    return;
  }

  const entry = await pickEntry(index);
  if (entry === undefined) {
    return;
  }

  if (usePanel) {
    await openInSearchPanel(entry.key);
    return;
  }

  const refs = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: `i18n: 搜索 "${entry.key}" 的引用` },
    () => findKeyReferences(entry.key, config.include, config.maxReferences),
  );
  if (refs.length === 0) {
    void vscode.window.showInformationMessage(`key "${entry.key}" 在代码中无引用`);
    return;
  }
  await pickReference(refs, config.maxReferences, entry.key);
}

// ---------- QuickPick ①：选语言包条目 ----------

interface EntryItem extends vscode.QuickPickItem {
  entry?: IndexedEntry;
}

function toEntryItem(e: IndexedEntry): EntryItem {
  return { label: e.value, description: e.key, detail: e.filePath, entry: e };
}

function pickEntry(index: LocaleIndex): Promise<IndexedEntry | undefined> {
  const all = index.allEntries();
  if (all.length === 0) {
    void vscode.window.showWarningMessage('语言包索引为空（未解析出任何文案条目）');
    return Promise.resolve(undefined);
  }
  return new Promise(resolve => {
    const qp = vscode.window.createQuickPick<EntryItem>();
    qp.placeholder = '输入要搜索的中文（子串匹配）';
    qp.items = [];
    // 自己做子串过滤（QuickPick 内置模糊匹配对中文不可控），每次最多展示 50 条；
    // 有输入但无命中时给出明确提示（对应 spec 错误处理表「中文无命中」）
    qp.onDidChangeValue(value => {
      const hits = matchEntries(all, value).slice(0, 50).map(toEntryItem);
      qp.items = value.trim() && hits.length === 0
        ? [{ label: `$(alert) 语言包中未找到包含 "${value.trim()}" 的文案` }]
        : hits;
    });
    let accepted = false;
    qp.onDidAccept(() => {
      accepted = true;
      const entry = qp.activeItems[0]?.entry;
      qp.hide();
      resolve(entry);
    });
    qp.onDidHide(() => {
      if (!accepted) {
        resolve(undefined);
      }
      qp.dispose();
    });
    qp.show();
  });
}

// ---------- QuickPick ②：选代码引用并跳转 ----------

interface ReferenceItem extends vscode.QuickPickItem {
  ref?: KeyReference;
  openPanel?: boolean;
  isNotice?: boolean;
}

function pickReference(refs: KeyReference[], maxReferences: number, key: string): Promise<void> {
  return new Promise(resolve => {
    const qp = vscode.window.createQuickPick<ReferenceItem>();
    qp.placeholder = `"${key}" 的引用（回车跳转）`;
    qp.matchOnLabel = false;
    qp.matchOnDescription = false;
    qp.matchOnDetail = false;

    const items: ReferenceItem[] = [
      { label: '$(search) 在原生搜索面板中打开', openPanel: true, isNotice: false },
    ];
    if (refs.length >= maxReferences) {
      items.push({
        label: `$(alert) 结果已达上限 ${maxReferences} 条已截断，建议改用原生面板`,
        isNotice: true,
      });
    }
    for (const r of refs) {
      items.push({
        label: `${vscode.workspace.asRelativePath(r.uri)}:${r.range.start.line + 1}`,
        detail: r.lineText.trim(),
        ref: r,
      });
    }
    qp.items = items;

    let resolved = false;
    qp.onDidAccept(async () => {
      const item = qp.activeItems[0];
      if (!item || item.isNotice) {
        return;
      }
      resolved = true;
      qp.hide();
      if (item.openPanel) {
        await openInSearchPanel(key);
      } else if (item.ref) {
        const doc = await vscode.workspace.openTextDocument(item.ref.uri);
        const editor = await vscode.window.showTextDocument(doc);
        editor.selection = new vscode.Selection(item.ref.range.start, item.ref.range.end);
        editor.revealRange(item.ref.range, vscode.TextEditorRevealType.InCenter);
      }
      resolve();
    });
    qp.onDidHide(() => {
      if (!resolved) {
        resolve();
      }
      qp.dispose();
    });
    qp.show();
  });
}

// ---------- 转接原生搜索面板 ----------

async function openInSearchPanel(key: string): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.findInFiles', {
    query: buildKeySearchPattern(key),
    isRegex: true,
    triggerSearch: true,
    matchCase: true,
  });
}
```

- [ ] **Step 2: 编译 + 全测试**

Run: `npm test`
Expected: 编译通过，既有测试全绿（命令尚未接线，不影响）。

- [ ] **Step 3: Commit**

```bash
git add src/commands/searchByChinese.ts
git commit -m "feat: 中文搜索两命令（QuickPick 跳转 + 原生面板转接）"
```

---

### Task 9: extension.ts 接线与激活测试

**Files:**
- Modify: `src/extension.ts`（替换 Task 1 占位）
- Test: `src/test/activation.test.ts`

- [ ] **Step 1: 写失败测试 src/test/activation.test.ts**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('extension activation', () => {
  test('两个命令均已注册', async () => {
    const ext = vscode.extensions.getExtension('i18n-ally-search.i18n-ally-search');
    assert.ok(ext, '扩展未加载，检查 publisher/name 是否为 i18n-ally-search');
    await ext.activate();
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes('i18nSearch.searchByChinese'));
    assert.ok(cmds.includes('i18nSearch.searchByChineseInPanel'));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: activation 测试 FAIL——占位 `activate()` 没注册命令（`assert.ok(cmds.includes(...))` 为假）。

- [ ] **Step 3: 写最终 src/extension.ts**

```typescript
import * as vscode from 'vscode';
import { LocaleIndex } from './locale/localeIndex';
import { registerCommands } from './commands/searchByChinese';
import { loadConfig } from './config';

let watchers: vscode.FileSystemWatcher[] = [];

export function activate(context: vscode.ExtensionContext): void {
  const index = new LocaleIndex();
  registerCommands(context, index);

  // 语言包变更 -> 防抖 500ms 重建索引
  const rebuild = debounce(() => void index.build(loadConfig()), 500);
  setupWatchers(context, rebuild);

  // i18nSearch.* 配置变更 -> 失效索引并换新 watcher（改 localePaths 无需重启）
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration('i18nSearch')) {
        return;
      }
      index.invalidate();
      for (const w of watchers) {
        w.dispose();
      }
      watchers = [];
      setupWatchers(context, rebuild);
      void index.build(loadConfig());
    }),
  );
}

function setupWatchers(context: vscode.ExtensionContext, rebuild: () => void): void {
  for (const glob of loadConfig().localePaths) {
    try {
      const watcher = vscode.workspace.createFileSystemWatcher(glob);
      watcher.onDidChange(rebuild);
      watcher.onDidCreate(rebuild);
      watcher.onDidDelete(rebuild);
      watchers.push(watcher);
      context.subscriptions.push(watcher);
    } catch {
      // 无效 glob 忽略，build 时会给出失败报告
    }
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  };
}

export function deactivate(): void {
  // nothing
}
```

- [ ] **Step 4: 跑全部测试确认通过**

Run: `npm test`
Expected: activation 1 个测试 PASS，其余保持 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/test/activation.test.ts
git commit -m "feat: 扩展接线（命令注册/watcher 防抖重建/配置热更新）"
```

---

### Task 10: README 与收尾

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README.md**

```markdown
# i18n Chinese Search

通过中文一步定位 i18n key 在代码中的引用位置。适用于 vue-i18n 等代码里只有 `$t('user.name')` 这类 key、
Ctrl+Shift+F 搜不到中文的场景。

## 为什么需要它

i18n Ally 等插件用编辑器 decoration 在 key 旁边「画」中文，但 decoration 是渲染层虚拟文本，
不进入文档模型，VS Code 搜索架构上索引不到。本插件绕开这一限制：输入中文 → 反查语言包 key →
全局搜索带引号的 key 引用 → 直接跳转。

## 使用

1. 配置中文语言包位置（支持多个 glob）：

   ```json
   "i18nSearch.localePaths": ["src/locales/**/zh-CN.json"]
   ```

2. 命令面板执行：
   - **i18n: 通过中文搜索代码** —— 输入中文子串 → 选语言包条目 → 选引用位置回车跳转；
   - **i18n: 通过中文搜索代码（原生搜索面板）** —— 同流程，最后打开 VS Code 原生搜索面板（正则已填好）。

3. 建议快捷键（keybindings.json）：

   ```json
   { "key": "ctrl+alt+t", "command": "i18nSearch.searchByChinese" }
   ```

## 配置项

| 配置 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `i18nSearch.localePaths` | `string[]` | `[]` | 中文语言包 glob 数组 |
| `i18nSearch.keyStyle` | `string` | `"auto"` | `nested` / `flat` / `auto` |
| `i18nSearch.include` | `string[]` | `["**/*.{vue,ts,js,tsx,jsx}"]` | 代码引用搜索范围 |
| `i18nSearch.maxReferences` | `number` | `200` | 引用结果上限 |

## 开发

```bash
npm install
npm run compile   # 编译
npm test          # 单元 + 集成测试（首次会下载独立 VS Code）
```

F5 启动 Extension Development Host 手动验证。`test-fixtures/` 是自动化测试用的工作区。
```

- [ ] **Step 2: 全量验证**

Run: `npm test`
Expected: 全部测试 PASS（约 20 个：flatten 10 + parser 4 + config 5 + localeIndex 4 + regex 4 + integration 6 + activation 1）。

- [ ] **Step 3: 手动验收（F5，打开 test-fixtures 文件夹）**

按顺序确认：

1. F5 启动 Extension Development Host，`File > Open Folder` 选 `test-fixtures`；
2. `Ctrl+Shift+P` → `i18n: 通过中文搜索代码`，输入「用户」→ 应列出 `用户名`、`请输入用户名`；选 `用户名` → 列出 `src/demo.vue:2`；回车 → 打开 demo.vue 并选中 `'user.name'`；
3. 修改 `test-fixtures/locales/zh-CN.json` 增加一条新文案并保存，1 秒后再搜应能命中（watcher 重建）；
4. `i18n: 通过中文搜索代码（原生搜索面板）`，选「用户名」→ 原生搜索面板打开且正则已填好、结果非空；
5. 清空 settings 里的 localePaths（或新开窗口未配置）执行命令 → 弹「请先配置」警告 + 打开设置按钮。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README（使用说明/配置/开发）"
```
