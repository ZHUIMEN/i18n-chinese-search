import * as assert from 'assert';
import * as vscode from 'vscode';

suite('extension activation', () => {
  test('两个命令均已注册', async () => {
    const ext = vscode.extensions.getExtension('i18n-chinese-search.i18n-chinese-search');
    assert.ok(ext, '扩展未加载，检查 publisher/name 是否为 i18n-chinese-search');
    await ext.activate();
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes('i18nSearch.searchByChinese'));
    assert.ok(cmds.includes('i18nSearch.searchByChineseInPanel'));
  });
});
