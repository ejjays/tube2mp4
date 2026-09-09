import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import { getMessaging } from '@react-native-firebase/messaging';
import App from './App';
import { initCrashReporter, wrap } from './src/lib/crash';
import { registerNotificationBackgroundHandler } from './src/lib/notify';
import { displaySocialNotification } from './src/lib/social/pushRender';

const _origLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (first.includes('ffmpeg-kit-react-native')) return;
  _origLog(...(args as []));
};

initCrashReporter();
registerNotificationBackgroundHandler();

try {
  getMessaging().setBackgroundMessageHandler(async (message) => {
    await displaySocialNotification(message);
  });
} catch {
  /* FCM missing on pre-rebuild dev client */
}

registerRootComponent(wrap(App));
