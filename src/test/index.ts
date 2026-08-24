import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

function findTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTestFiles(p));
    } else if (entry.name.endsWith('.test.js')) {
      out.push(p);
    }
  }
  return out;
}

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  for (const file of findTestFiles(__dirname)) {
    mocha.addFile(file);
  }
  await new Promise<void>((resolve, reject) => {
    mocha.run(failures => (failures > 0 ? reject(new Error(`${failures} 个测试失败`)) : resolve()));
  });
}
