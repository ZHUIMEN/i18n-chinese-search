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
  private building: Promise<BuildReport> = Promise.resolve({ filesLoaded: 0, entries: 0, failures: [] });

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
