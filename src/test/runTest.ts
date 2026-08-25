import * as fs from 'fs';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // 插件目录 = 仓库根；测试工作区 = test-fixtures（若不存在则用默认空窗口）
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'index');
    const workspacePath = path.resolve(__dirname, '../../../test-fixtures');
    const launchArgs = fs.existsSync(workspacePath) ? [workspacePath] : [];
    await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
