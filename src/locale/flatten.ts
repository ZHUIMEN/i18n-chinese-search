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
