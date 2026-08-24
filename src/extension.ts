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
