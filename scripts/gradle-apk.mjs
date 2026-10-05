import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('android/gradlew') && !existsSync('android/gradlew.bat')) {
  console.error('找不到 Gradle。先运行 npm run android:add');
  process.exit(1);
}

const command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(command, ['assembleDebug', '--no-daemon'], {
  cwd: 'android',
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) process.exit(result.status ?? 1);
console.log('APK 在 android/app/build/outputs/apk/debug/');
