import * as assert from 'assert';
import { normalizePaths } from '../config';

suite('normalizePaths', () => {
  test('数组：trim 尾斜杠、反斜杠转正斜杠', () => {
    assert.deepStrictEqual(normalizePaths(['src/locales/', 'b\\c', 'a//']), [
      'src/locales',
      'b/c',
      'a',
    ]);
  });

  test('逗号分隔字符串', () => {
    assert.deepStrictEqual(normalizePaths('a, b ,,c'), ['a', 'b', 'c']);
  });

  test('空串与空白项被过滤', () => {
    assert.deepStrictEqual(normalizePaths(['', '  ', 'ok']), ['ok']);
  });

  test('非字符串项被过滤', () => {
    assert.deepStrictEqual(normalizePaths([1, 'ok', null]), ['ok']);
  });

  test('undefined 返回空数组', () => {
    assert.deepStrictEqual(normalizePaths(undefined), []);
  });
});
