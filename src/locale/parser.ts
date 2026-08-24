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
