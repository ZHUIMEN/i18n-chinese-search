import * as vscode from 'vscode';
import { LocaleIndex, IndexedEntry, matchEntries, BuildReport } from '../locale/localeIndex';
import { ExtensionConfig, loadConfig } from '../config';
import {
  KeyReference,
  buildKeySearchPattern,
  buildKeysSearchPattern,
  findKeyReferences,
} from '../search/referenceFinder';

export function registerCommands(context: vscode.ExtensionContext, index: LocaleIndex): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('i18nSearch.searchByChinese', () => runSearch(index, false)),
    vscode.commands.registerCommand('i18nSearch.searchByChineseInPanel', () => runSearch(index, true)),
    vscode.commands.registerCommand('i18nSearch.quickSearchInPanel', () => runQuickPanelSearch(index)),
  );
}

/** 工作区与 localeSearchPaths 前置检查（不通过时给出提示并返回 false） */
async function ensureWorkspaceAndConfig(config: ExtensionConfig): Promise<boolean> {
  if (vscode.workspace.workspaceFolders === undefined || vscode.workspace.workspaceFolders.length === 0) {
    void vscode.window.showWarningMessage('i18n Chinese Search 需要在工作区中使用');
    return false;
  }
  if (config.localeSearchPaths.length === 0) {
    const pick = await vscode.window.showWarningMessage(
      '请先配置 i18nSearch.localeSearchPaths（中文语言包 glob 数组，如 ["src/locales/**/zh-CN.json"]）',
      '打开设置',
    );
    if (pick === '打开设置') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'i18nSearch.localeSearchPaths');
    }
    return false;
  }
  return true;
}

/** 构建索引（带进度提示）；无可加载文件时提示并返回 undefined */
async function ensureIndex(config: ExtensionConfig, index: LocaleIndex): Promise<BuildReport | undefined> {
  // 首次构建/配置变更后重建时给出可见反馈（大语言包目录解析需要时间）
  const report = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'i18n: 正在加载语言包索引' },
    () => index.ensure(config),
  );
  for (const failure of report.failures) {
    void vscode.window.showWarningMessage(`语言包加载失败：${failure.file}（${failure.message}）`);
  }
  if (report.filesLoaded === 0) {
    void vscode.window.showWarningMessage(
      `localeSearchPaths 未匹配到任何可加载的语言包文件：${config.localeSearchPaths.join(', ')}`,
    );
    return undefined;
  }
  return report;
}

async function runSearch(index: LocaleIndex, usePanel: boolean): Promise<void> {
  const config = loadConfig();
  if (!(await ensureWorkspaceAndConfig(config))) {
    return;
  }
  const report = await ensureIndex(config, index);
  if (report === undefined) {
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
    {
      location: vscode.ProgressLocation.Notification,
      title: `i18n: 搜索 "${entry.key}" 的引用`,
      cancellable: true,
    },
    (progress, token) =>
      findKeyReferences(
        entry.key,
        config.include,
        config.maxReferences,
        ({ scanned, total }) => {
          progress.report({ message: `已扫描 ${scanned}/${total} 个文件` });
        },
        token,
      ),
  );
  if (refs.length === 0) {
    void vscode.window.showInformationMessage(`key "${entry.key}" 在代码中无引用`);
    return;
  }
  await pickReference(refs, config.maxReferences, entry.key);
}

// ---------- Search 面板顶部按钮：输入中文 -> 合并所有命中 key -> 直接打开原生搜索 ----------

async function runQuickPanelSearch(index: LocaleIndex): Promise<void> {
  const config = loadConfig();
  if (!(await ensureWorkspaceAndConfig(config))) {
    return;
  }

  const input = await vscode.window.showInputBox({
    placeHolder: '输入要搜索的中文，如：用户名',
    prompt: '命中的所有 key 将合并为一个正则，直接在搜索面板中打开',
  });
  if (input === undefined || input.trim() === '') {
    return;
  }

  const report = await ensureIndex(config, index);
  if (report === undefined) {
    return;
  }

  const hits = index.search(input);
  if (hits.length === 0) {
    void vscode.window.showInformationMessage(`语言包中未找到包含 "${input.trim()}" 的文案`);
    return;
  }

  await vscode.commands.executeCommand('workbench.action.findInFiles', {
    query: buildKeysSearchPattern(hits.map(h => h.key)),
    isRegex: true,
    triggerSearch: true,
    matchCase: true,
  });
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
    // 注：QuickPick API 没有 matchOnLabel（label 匹配不可关），只有以下两项可关
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
