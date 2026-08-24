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

// vscode.workspace.findTextInFiles 目前仍是 proposed API，稳定版 @types/vscode 无类型声明，
// 这里做最小本地声明（与计划意图一致：存在则用，否则/抛错走逐文件扫描）。
interface TextSearchMatchLike {
  uri: vscode.Uri;
  preview: { text: string };
  ranges: vscode.Range | vscode.Range[];
}

type FindTextInFilesApi = (
  query: { pattern: string; isRegex: boolean; isCaseSensitive: boolean },
  options: { include?: string; maxResults?: number },
  callback: (result: TextSearchMatchLike) => void,
) => Thenable<void>;

function getFindTextInFiles(): FindTextInFilesApi | undefined {
  const candidate = (vscode.workspace as unknown as { findTextInFiles?: unknown }).findTextInFiles;
  return typeof candidate === 'function' ? (candidate as FindTextInFilesApi) : undefined;
}

export async function findKeyReferences(key: string, include: string[], maxResults: number): Promise<KeyReference[]> {
  // 优先用官方 API（内置 ripgrep，尊重 search.exclude）；
  // API 不存在（老版本 VS Code）或抛错时退化为逐文件扫描。
  const findTextInFiles = getFindTextInFiles();
  if (findTextInFiles) {
    try {
      return await findByApi(findTextInFiles, key, include, maxResults);
    } catch {
      // fallthrough
    }
  }
  return findByFileScan(key, include, maxResults);
}

async function findByApi(
  findTextInFiles: FindTextInFilesApi,
  key: string,
  include: string[],
  maxResults: number,
): Promise<KeyReference[]> {
  const out: KeyReference[] = [];
  await findTextInFiles(
    { pattern: buildKeySearchPattern(key), isRegex: true, isCaseSensitive: true },
    { include: includePattern(include), maxResults },
    result => {
      const match = result;
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
