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
