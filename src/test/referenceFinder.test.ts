import * as assert from 'assert';
import { escapeRegex, buildKeySearchPattern, includePattern } from '../search/referenceFinder';

suite('regex helpers', () => {
  test('转义正则特殊字符', () => {
    assert.strictEqual(escapeRegex('user.name'), 'user\\.name');
    assert.strictEqual(escapeRegex('a+b(c)'), 'a\\+b\\(c\\)');
  });

  test('生成带引号的 key 匹配模式', () => {
    assert.strictEqual(buildKeySearchPattern('user.name'), "['\"`]user\\.name['\"`]");
  });

  test('模式命中三种引号与多种调用形态', () => {
    const re = new RegExp(buildKeySearchPattern('user.name'));
    assert.ok(re.test(`$t('user.name')`));
    assert.ok(re.test('t("user.name")'));
    assert.ok(re.test('$t(`user.name`)'));
    assert.ok(re.test(`v-t="'user.name'"`));
    assert.ok(!re.test('$t(user.name)'));        // 无引号不命中
    assert.ok(!re.test('$t(\'user.nameX\')'));   // 后缀不同不命中
  });

  test('include 多个 glob 合并为花括号', () => {
    assert.strictEqual(includePattern(['**/*.vue', '**/*.ts']), '{**/*.vue,**/*.ts}');
    assert.strictEqual(includePattern(['**/*.{vue,ts}']), '**/*.{vue,ts}');
  });
});
