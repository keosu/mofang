import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';

if (!existsSync(manifestPath)) {
  console.error('找不到 Android 工程。先运行 npm run android:add');
  process.exit(1);
}

let xml = readFileSync(manifestPath, 'utf8');

function ensure(marker, snippet) {
  if (xml.includes(marker)) return;
  xml = xml.replace(/<application[\s>]/, `${snippet}\n    $&`);
}

ensure('android.permission.CAMERA', '<uses-permission android:name="android.permission.CAMERA" />');
ensure(
  'android.permission.READ_MEDIA_IMAGES',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
);
ensure(
  'android.hardware.camera',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
);

writeFileSync(manifestPath, xml);
console.log('Android 清单已包含相机权限');

// 全屏：隐藏顶部状态栏，内容延伸到刘海区域。
const stylesPath = 'android/app/src/main/res/values/styles.xml';
if (existsSync(stylesPath)) {
  let styles = readFileSync(stylesPath, 'utf8');
  const fullscreenItems = [
    '<item name="android:windowFullscreen">true</item>',
    '<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>',
  ];
  const opening = /<style name="AppTheme\.NoActionBar"[^>]*>/;
  if (opening.test(styles) && !styles.includes('android:windowFullscreen')) {
    styles = styles.replace(opening, (tag) => `${tag}\n        ${fullscreenItems.join('\n        ')}`);
    writeFileSync(stylesPath, styles);
    console.log('Android 主题已设为全屏');
  } else if (!opening.test(styles)) {
    console.warn('没有找到 AppTheme.NoActionBar，全屏主题未设置');
  }
}
