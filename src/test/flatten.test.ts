import * as assert from 'assert';
import { flattenLocale } from '../locale/flatten';

suite('flattenLocale', () => {
  test('nested 拍平为点路径', () => {
    assert.deepStrictEqual(flattenLocale({ user: { name: '用户名' } }, 'nested'), [
      { key: 'user.name', value: '用户名' },
    ]);
  });

  test('深层嵌套逐级拼接', () => {
    assert.deepStrictEqual(flattenLocale({ a: { b: { c: '深' } } }, 'nested'), [
      { key: 'a.b.c', value: '深' },
    ]);
  });

  test('flat 模式直接取顶层字符串 key', () => {
    assert.deepStrictEqual(
      flattenLocale({ 'user.name': '用户名', 'common.confirm': '确认' }, 'flat'),
      [
        { key: 'user.name', value: '用户名' },
        { key: 'common.confirm', value: '确认' },
      ],
    );
  });

  test('auto：顶层存在「key 含点且值为字符串」判为 flat', () => {
    assert.deepStrictEqual(flattenLocale({ 'user.name': '用户名' }, 'auto'), [
      { key: 'user.name', value: '用户名' },
    ]);
  });

  test('auto：否则判为 nested', () => {
    assert.deepStrictEqual(flattenLocale({ user: { name: 'x' } }, 'auto'), [
      { key: 'user.name', value: 'x' },
    ]);
  });

  test('nested 模式下含点的对象 key 按路径拼接（vue-i18n 等价语义）', () => {
    assert.deepStrictEqual(flattenLocale({ 'user.name': { placeholder: '占位' } }, 'nested'), [
      { key: 'user.name.placeholder', value: '占位' },
    ]);
  });

  test('数组值跳过', () => {
    assert.deepStrictEqual(flattenLocale({ list: ['a', 'b'], ok: '好' }, 'nested'), [
      { key: 'ok', value: '好' },
    ]);
  });

  test('非字符串叶子跳过', () => {
    assert.deepStrictEqual(flattenLocale({ n: 1, ok: '好' }, 'nested'), [
      { key: 'ok', value: '好' },
    ]);
  });

  test('flat 模式下非字符串顶层值跳过', () => {
    assert.deepStrictEqual(flattenLocale({ 'a.b': 'x', other: { c: 'y' } }, 'flat'), [
      { key: 'a.b', value: 'x' },
    ]);
  });

  test('空对象返回空数组', () => {
    assert.deepStrictEqual(flattenLocale({}, 'auto'), []);
  });
});
