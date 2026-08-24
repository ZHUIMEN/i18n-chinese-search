import * as assert from 'assert';
import { jsonParser } from '../locale/jsonParser';
import { getParserForFile } from '../locale/parser';

suite('locale parsers', () => {
  test('jsonParser 解析 JSON 文本', async () => {
    assert.deepStrictEqual(await jsonParser.parse('{"a":"b"}'), { a: 'b' });
  });

  test('jsonParser 拒绝非法 JSON', async () => {
    await assert.rejects(() => jsonParser.parse('{ broken'));
  });

  test('jsonParser 识别 .json 扩展名', () => {
    assert.strictEqual(jsonParser.supports('.json'), true);
    assert.strictEqual(jsonParser.supports('.yaml'), false);
  });

  test('注册表按文件路径查找解析器', () => {
    assert.strictEqual(getParserForFile('C:/proj/src/locales/zh-CN.json')?.id, 'json');
    assert.strictEqual(getParserForFile('locales/zh-CN.yaml'), undefined);
  });
});
