import { useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { warn as logWarn } from '../../lib/log';
import {
  attachGenericWebView,
  onWebViewFailed,
  onWebViewHttpError,
  onGenericWebViewMessage,
  onWebViewPageEnded,
  onWebViewRequest,
} from '../../lib/webviewExtraction/host';

export default function GenericExtractorWebView() {
  const ref = useRef<WebView>(null);
  const [source, setSource] = useState<
    { uri: string } | { html: string; baseUrl: string }
  >({ uri: 'about:blank' });

  const recover = (reason: string): void => {
    logWarn('GenericExtractorWebView', `[WEBVIEW] ${reason}; reloading`);
    setSource({ uri: 'about:blank' });
    ref.current?.reload();
  };

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -10000,
        left: 0,
        width: 200,
        height: 200,
        opacity: 0,
      }}
    >
      <WebView
        ref={ref}
        source={source}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        onLoadStart={() =>
          attachGenericWebView({
            navigate: (uri) => setSource({ uri }),
            injectJavaScript: (js) => ref.current?.injectJavaScript(js),
          })
        }
        onNavigationStateChange={({ url }) => onWebViewPageEnded(url)}
        onShouldStartLoadWithRequest={(request) => {
          onWebViewRequest(request.url);
          return true;
        }}
        onMessage={(event) => onGenericWebViewMessage(event.nativeEvent.data)}
        onError={({ nativeEvent }) => {
          logWarn(
            'GenericExtractorWebView',
            `load error: ${nativeEvent.code} ${nativeEvent.description}`
          );
          onWebViewFailed();
        }}
        onHttpError={({ nativeEvent }) => {
          logWarn(
            'GenericExtractorWebView',
            `http error: ${nativeEvent.statusCode} @ ${nativeEvent.url}`
          );
          onWebViewHttpError(nativeEvent.url);
        }}
        onRenderProcessGone={({ nativeEvent }) =>
          recover(`render process gone (crashed=${nativeEvent?.didCrash})`)
        }
        onContentProcessDidTerminate={() =>
          recover('content process terminated')
        }
        style={{ flex: 1 }}
      />
    </View>
  );
}
