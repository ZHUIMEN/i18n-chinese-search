import type { LocaleFileParser } from './parser';

export const jsonParser: LocaleFileParser = {
  id: 'json',
  supports: ext => ext === '.json',
  async parse(text: string): Promise<Record<string, unknown>> {
    return JSON.parse(text) as Record<string, unknown>;
  },
};
