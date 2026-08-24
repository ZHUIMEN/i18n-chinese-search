import * as assert from 'assert';
import { LocaleIndex } from '../locale/localeIndex';
import { loadConfig } from '../config';
import { findKeyReferences } from '../search/referenceFinder';

suite('integration: LocaleIndex 构建（fixture 工作区）', () => {
  test('加载语言包、跳过坏文件、建立反向索引', async () => {
    const index = new LocaleIndex();
    const report = await index.build(loadConfig());

    // broken.json 解析失败但 zh-CN.json 正常加载
    assert.strictEqual(report.filesLoaded, 1);
    assert.strictEqual(report.failures.length, 1);
    assert.ok(report.failures[0].file.includes('broken.json'));

    const hits = index.search('用户');
    assert.deepStrictEqual(hits.map(h => h.key), ['user.name', 'login.usernamePlaceholder']);

    const exact = index.search('特殊键');
    assert.strictEqual(exact.length, 1);
    assert.strictEqual(exact[0].key, 'special.key.hello');
  });

  test('ensure 幂等：同配置不重建', async () => {
    const index = new LocaleIndex();
    await index.build(loadConfig());
    const before = index.lastBuildReport;
    await index.ensure(loadConfig());
    assert.strictEqual(index.lastBuildReport, before); // 同一 report 引用，未重建
  });

  test('invalidate 后 ensure 重建', async () => {
    const index = new LocaleIndex();
    await index.build(loadConfig());
    index.invalidate();
    await index.ensure(loadConfig());
    assert.notStrictEqual(index.lastBuildReport, { filesLoaded: 0, entries: 0, failures: [] });
    assert.strictEqual(index.lastBuildReport.filesLoaded, 1);
  });
});

suite('integration: 代码引用搜索（fixture 工作区）', () => {
  test('vue 模板与 script 中的引用都能定位', async () => {
    const refs = await findKeyReferences('user.name', ['**/*.vue', '**/*.ts'], 200);
    assert.strictEqual(refs.length, 1);
    assert.ok(refs[0].uri.fsPath.replace(/\\/g, '/').endsWith('test-fixtures/src/demo.vue'));
    assert.strictEqual(refs[0].range.start.line, 1); // <div>{{ $t('user.name') }}</div>
    assert.ok(refs[0].lineText.includes("$t('user.name')"));
  });

  test('ts 文件双引号引用也能定位', async () => {
    const refs = await findKeyReferences('common.cancel', ['**/*.vue', '**/*.ts'], 200);
    assert.strictEqual(refs.length, 1);
    assert.ok(refs[0].uri.fsPath.replace(/\\/g, '/').endsWith('test-fixtures/src/demo.ts'));
  });

  test('无引用返回空数组', async () => {
    const refs = await findKeyReferences('not.used.key', ['**/*.vue', '**/*.ts'], 200);
    assert.deepStrictEqual(refs, []);
  });
});
