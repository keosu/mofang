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
