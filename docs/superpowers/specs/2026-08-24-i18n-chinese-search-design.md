# i18n-chinese-search 插件设计文档

日期：2026-08-24
状态：已与用户确认的设计

## 1. 背景与目标

vue-i18n 项目中代码文件只有 key（如 `$t('user.name')`），没有中文，VS Code 原生全局搜索（Ctrl+Shift+F）无法从中文一步跳到代码。i18n Ally 虽然用 `TextEditorDecorationType.after.contentText` 在编辑器里回显了中文，但 decoration 是纯渲染层虚拟文本，不进入文档模型（`document.getText()` 不含它），底层 ripgrep 搜索架构上不可能索引到。

**目标**：写一个 VS Code 插件，提供「中文 -> 代码位置」的一步定位能力：

- 输入中文子串 -> 反查语言包得到 key -> 全局搜索代码中该 key 的引用 -> 直接跳转；
- 同时提供转接 VS Code 原生搜索面板的命令变体。

**明确不做**（YAGNI）：

- 不让 decoration/InlayHint 文本可被原生搜索索引（架构上不可能）；
- 不做全量代码引用索引、引用统计、key 清理（方案 B 的能力，将来可扩展）；
- 不做多语言/多 locale 反查（只针对中文语言包）；
- 不做拼音首字母匹配；
- 不写回/修改语言包。

## 2. 总体方案

自研轻量插件：**语言包反向索引（中文 -> key）+ 按需 ripgrep 扫代码（key -> 引用位置）**。

- 语言包侧：激活时懒加载，读配置的 glob 路径数组，拍平嵌套 JSON，建 `中文值 -> key[]` 反向索引；FileSystemWatcher 防抖重建。
- 代码侧：查询时才用 `vscode.workspace.findTextInFiles`（VS Code 内置 ripgrep）搜带引号的 key；若 API 不可用退化为 `findFiles` + 逐文件正则。
- 零第三方运行时依赖（不需要 fuse.js；中文值匹配用子串，QuickPick 自带模糊过滤）。

已否决的备选：全量双向索引 + 侧边栏 TreeView（查询快但维护成本高、超出需求）；fork/给 i18n Ally 提需求（周期不可控）。

## 3. 借鉴 i18n Ally 的三点

调研了 lokalise/i18n-ally 源码（`src/parsers/`、`src/core/`），借鉴其架构思想但保持零依赖：

1. **可插拔解析器接口**（源自 `parsers/base.ts` 的抽象 `Parser`）：定义最小接口 `LocaleFileParser { id, supports(ext), parse(text) }`，MVP 只实现 `JsonParser`，后续可加 JSON5/YAML。
2. **路径发现的分层**（源自 `core/Config.ts`）：路径规范化统一处理（数组或逗号分隔字符串、trim 尾斜杠、`\` 转 `/`）；不引入 `{locale}` 占位符机制，直接用 glob。
3. **key 风格 nested/flat 兼容**（源自 `keystyle` 配置）：`keyStyle: nested | flat | auto`，auto 启发式判断（顶层 key 含 `.` 且值为字符串 -> flat）。拍平含 `.` 的 key 时按 vue-i18n 语义处理歧义（`{'user.name': {...}}` 与 `{user: {name: ...}}` 等价路径）。

不借鉴：多加载器组合、Vue SFC 内嵌语言块、机器翻译、Review、AST 注解。

## 4. 模块设计

| 模块 | 职责 | 依赖 |
|:---|:---|:---|
| `config.ts` | 读配置 + 路径规范化 | vscode API |
| `locale/parser.ts` | `LocaleFileParser` 接口 + 解析器注册表 | 无 |
| `locale/jsonParser.ts` | JSON 解析实现 | 无 |
| `locale/flatten.ts` | 纯函数：对象 -> `{key, value}[]`，支持 nested/flat/auto、含点 key | 无 |
| `locale/localeIndex.ts` | glob 加载文件、建反向索引、watcher 防抖重建 | parser、config |
| `search/referenceFinder.ts` | `findTextInFiles` 封装 + 退化方案 + 结果截断 | vscode API |
| `commands/searchByChinese.ts` | 两个命令的 QuickPick 编排 | localeIndex、referenceFinder |
| `extension.ts` | 注册命令、watcher、配置变更监听 | 全部 |

### 4.1 代码引用匹配策略

搜「带引号的 key 字符串」（如 `'user.name'`）而不是 `$t(...)` 调用模式：可同时命中 `$t('user.name')`、`t("user.name")`、`` $t(`user.name`) ``、`v-t="'user.name'"`、路由配置里的裸 key 字符串，覆盖面最广且无需配置调用函数名。

### 4.2 索引时机

激活时不扫描；首次执行命令时懒构建索引；之后 FileSystemWatcher（防抖 500ms）增量重建。重建期间命令用旧索引继续服务（可接受的最终一致）。

## 5. 配置项

| 配置 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `i18nSearch.localePaths` | `string[]` | `[]` | 中文语言包 glob 数组，如 `["src/locales/**/zh-CN.json"]`；也容忍逗号分隔字符串 |
| `i18nSearch.keyStyle` | `string` | `"auto"` | `nested` / `flat` / `auto` |
| `i18nSearch.include` | `string[]` | `["**/*.{vue,ts,js,tsx,jsx}"]` | 代码引用搜索范围 |
| `i18nSearch.maxReferences` | `number` | `200` | 引用结果上限 |

## 6. 命令与交互

| 命令 | ID |
|:---|:---|
| i18n: 通过中文搜索代码 | `i18nSearch.searchByChinese` |
| i18n: 通过中文搜索代码（原生搜索面板） | `i18nSearch.searchByChineseInPanel` |

**主命令流程**：

1. QuickPick ①：输入中文子串，实时过滤语言包条目；条目 label 为中文值、description 为 key、detail 为来源文件。只命中一条也仍显示列表（回车确认，避免误判）。
2. QuickPick ②：列出引用；label 为 `文件路径:行号`，detail 为该行代码预览。顶部固定「↗ 在原生搜索面板中打开」条目。回车 `showTextDocument` + `Selection` 定位到 key 所在列。
3. 两级均可 `Esc` 退出。

**面板命令流程**：QuickPick ① 同上；选中条目后拼 `['"\`]key['"\`]` 正则（key 中 `.` 转义），执行 `workbench.action.findInFiles` 打开原生搜索。同一中文值对应多个 key 时，①中会分条列出，用户逐条选择。

**快捷键**：不设默认 keybinding（避免与 i18n Ally 等冲突），README 建议用户自绑（如 `Ctrl+Alt+T`）。

## 7. 错误处理

| 场景 | 处理 |
|:---|:---|
| 无工作区 / `localePaths` 为空 | warning「请配置 i18nSearch.localePaths」+「打开设置」按钮 |
| glob 匹配 0 个文件 | warning，展示配置值 |
| JSON 解析失败 | warning 指明具体文件，跳过该文件继续加载其余 |
| 中文无命中 | information「语言包中未找到包含 “xxx” 的文案」 |
| key 命中但代码无引用 | information「key X 在代码中无引用」（可能动态拼 key 或未被使用） |
| 引用数超上限 | 截断并在 QuickPick 顶部提示改用原生面板命令 |
| 语言包变更 | 防抖 500ms 重建；期间用旧索引 |

## 8. 项目结构与实现顺序

```
i18n-chinese-search/
├── package.json / tsconfig.json / esbuild.js
├── src/
│   ├── extension.ts
│   ├── config.ts
│   ├── locale/{parser.ts, jsonParser.ts, flatten.ts, localeIndex.ts}
│   ├── search/referenceFinder.ts
│   └── commands/searchByChinese.ts
└── src/test/
```

实现顺序：脚手架 -> flatten + 单测 -> parser + localeIndex + watcher -> referenceFinder -> 主命令 -> 面板命令 -> 集成测试 + fixture。

## 9. 测试策略

**单元测试（纯逻辑）**：flatten（nested/flat/auto/含点 key/数组值/深层嵌套）；中文子串匹配（多命中、空输入）；查询正则生成（转义、`|` 拼接、引号字符类）。

**集成测试（`@vscode/test-electron`）**：fixture 工作区（嵌套 zh-CN.json + 含 `$t()` 的 vue/ts 文件）验证索引 -> 查询 -> 引用定位；坏 JSON 不拖垮整体加载。

**手动验收**：两命令全流程；语言包热更新后能搜到新增文案；改 `localePaths` 配置无需重启（配置变更监听重建）。

## 10. 技术要点备忘

- `vscode.workspace.findTextInFiles`：基于内置 ripgrep，尊重 `search.exclude` / `files.exclude`。
- `workbench.action.findInFiles` 支持 `{query, isRegex, triggerSearch, ...}` 参数预填搜索面板。
- decoration/InlayHint/CodeLens 均为渲染层，不进搜索索引——这是本插件存在的原因，不要回头尝试。
