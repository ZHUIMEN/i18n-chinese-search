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

/** 扫描进度（当前仅退化扫描路径会真实回报） */
export interface FindProgress {
  scanned: number;
  total: number;
}

export async function findKeyReferences(
  key: string,
  include: string[],
  maxResults: number,
  onProgress?: (p: FindProgress) => void,
  token?: vscode.CancellationToken,
): Promise<KeyReference[]> {
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
  return findByFileScan(key, include, maxResults, onProgress, token);
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

/** 单文件扫描结果为空的体积上限：跳过压缩产物等大文件，避免拖慢全量扫描 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** 退化扫描的并发批大小 */
const SCAN_CHUNK = 32;

async function findByFileScan(
  key: string,
  include: string[],
  maxResults: number,
  onProgress?: (p: FindProgress) => void,
  token?: vscode.CancellationToken,
): Promise<KeyReference[]> {
  const regex = new RegExp(buildKeySearchPattern(key));
  const uris = await vscode.workspace.findFiles(includePattern(include), '**/node_modules/**');
  const out: KeyReference[] = [];
  for (let i = 0; i < uris.length; i += SCAN_CHUNK) {
    if (token?.isCancellationRequested) {
      break;
    }
    const chunk = uris.slice(i, i + SCAN_CHUNK);
    const hitsPerFile = await Promise.all(chunk.map(uri => scanFile(uri, regex)));
    outer: for (const hits of hitsPerFile) {
      for (const hit of hits) {
        if (out.length >= maxResults) {
          break outer;
        }
        out.push(hit);
      }
    }
    onProgress?.({ scanned: Math.min(i + SCAN_CHUNK, uris.length), total: uris.length });
  }
  return out;
}

async function scanFile(uri: vscode.Uri, regex: RegExp): Promise<KeyReference[]> {
  const raw = await vscode.workspace.fs.readFile(uri);
  if (raw.byteLength > MAX_FILE_BYTES) {
    return [];
  }
  const lines = new TextDecoder('utf-8').decode(raw).split(/\r?\n/);
  const hits: KeyReference[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = regex.exec(lines[i]);
    if (m) {
      hits.push({ uri, range: new vscode.Range(i, m.index, i, m.index + m[0].length), lineText: lines[i] });
    }
  }
  return hits;
}
