import * as assert from 'assert';
import { matchEntries, IndexedEntry } from '../locale/localeIndex';

const entries: IndexedEntry[] = [
  { key: 'user.name', value: '用户名', filePath: 'locales/zh-CN.json' },
  { key: 'login.usernamePlaceholder', value: '请输入用户名', filePath: 'locales/zh-CN.json' },
  { key: 'common.confirm', value: '确认', filePath: 'locales/zh-CN.json' },
];

suite('matchEntries（中文子串匹配）', () => {
  test('子串命中多条', () => {
    assert.deepStrictEqual(matchEntries(entries, '用户').map(e => e.key), [
      'user.name',
      'login.usernamePlaceholder',
    ]);
  });

  test('精确整词也命中', () => {
    assert.deepStrictEqual(matchEntries(entries, '确认').map(e => e.key), ['common.confirm']);
  });

  test('空查询返回空', () => {
    assert.deepStrictEqual(matchEntries(entries, ''), []);
    assert.deepStrictEqual(matchEntries(entries, '   '), []);
  });

  test('无命中返回空', () => {
    assert.deepStrictEqual(matchEntries(entries, '不存在的文案'), []);
  });
});
