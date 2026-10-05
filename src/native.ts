import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

/** On an installed Android build, ask the system for the camera before the page opens it. */
export async function ensureCameraPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const status = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
  if (status.camera === 'denied') {
    throw new DOMException('没有相机权限', 'NotAllowedError');
  }
}
