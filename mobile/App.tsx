import { useState, useRef, useEffect, useCallback } from 'react';
import { View, StatusBar, AppState, LogBox } from 'react-native';
import { useBackHandler } from './src/lib/back';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import tw from './src/lib/tw';
import TwinkleStars from './src/components/backgrounds/TwinkleStars';
import ShootingStars from './src/components/backgrounds/ShootingStars';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BottomNav, { type Tab } from './src/components/BottomNav';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UpdatesScreen from './src/screens/UpdatesScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import PlaylistPanel from './src/components/PlaylistPanel';
import { type DownloadMode } from './src/components/FormatBar';
import { resolve } from './src/extractors';
import { prewarmClientId } from './src/extractors/soundcloud';
import {
  Format,
  VideoInfo,
  ExtractorError,
} from '@phantom/extractors';
import PickerModal from './src/components/PickerModal';
import SpotifyPickerModal from './src/components/SpotifyPickerModal';
import NotificationPermissionSheet from './src/components/sheets/NotificationPermissionSheet';
import ErrorSheet from './src/components/sheets/ErrorSheet';
import { AppDialogProvider } from './src/components/AppDialog';
import YouTubeExtractorWebView from './src/components/webviews/YouTubeExtractorWebView';
import InstagramExtractorWebView from './src/components/webviews/InstagramExtractorWebView';
import GenericExtractorWebView from './src/components/webviews/GenericExtractorWebView';
import ErrorBoundary from './src/components/ErrorBoundary';
import { type DownloadMeta } from './src/lib/format';
import { isVpnActive } from './modules/vpn-detector';
import { getOnboarded, setOnboarded, getAutoPaste } from './src/lib/settings';
import { addDownloadTapListener } from './src/lib/notify';
import { registerDownloadService } from './src/lib/fgservice';
import { initPush } from './src/lib/social/push';
import { addSocialTapListener } from './src/lib/social/pushRender';
import { type SocialDeepLink } from './src/lib/social/notificationTap.logic';
import { openSavedTarget } from './src/lib/download/gallery';
import { useDownload } from './src/hooks/useDownload';
import { useClipboardPaste } from './src/hooks/useClipboardPaste';
import { useNotificationPriming } from './src/hooks/useNotificationPriming';
import { tapImpact, loadHaptics } from './src/lib/haptics';
import { log, error as logError } from './src/lib/log';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import IBMPlexMonoRegular from './assets/fonts/IBMPlexMono-Regular.ttf';
import IBMPlexMonoMedium from './assets/fonts/IBMPlexMono-Medium.ttf';
import IBMPlexMonoSemiBold from './assets/fonts/IBMPlexMono-SemiBold.ttf';
import IBMPlexMonoBold from './assets/fonts/IBMPlexMono-Bold.ttf';
import RubikRegular from './assets/fonts/Rubik-Regular.ttf';
import RubikMedium from './assets/fonts/Rubik-Medium.ttf';
import RubikSemiBold from './assets/fonts/Rubik-SemiBold.ttf';
import RubikBold from './assets/fonts/Rubik-Bold.ttf';

LogBox.ignoreLogs([/\[Reanimated\].*LayoutMetrics/iu]);

function scheduleIdle(fn: () => void): () => void {
  const scope = globalThis as unknown as {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof scope.requestIdleCallback === 'function') {
    const id = scope.requestIdleCallback(fn, { timeout: 800 });
    return () => scope.cancelIdleCallback?.(id);
  }
  const t = setTimeout(fn, 0);
  return () => clearTimeout(t);
}

const queryClient = new QueryClient();
void SplashScreen.preventAutoHideAsync();
function cleanUrl(raw: string): string {
  return raw.trim().replace(/^['"\s]+|['"\s]+$/gu, '');
}
function AppRoot() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexMono: IBMPlexMonoRegular,
    'IBMPlexMono-Medium': IBMPlexMonoMedium,
    'IBMPlexMono-SemiBold': IBMPlexMonoSemiBold,
    'IBMPlexMono-Bold': IBMPlexMonoBold,
    Rubik: RubikRegular,
    'Rubik-Medium': RubikMedium,
    'Rubik-SemiBold': RubikSemiBold,
    'Rubik-Bold': RubikBold,
  });
  const [tab, setTab] = useState<Tab>('home');
  const [visited, setVisited] = useState({
    downloads: false,
    settings: false,
    updates: false,
  });
  const [homeFocus] = useState(1);
  const [deepLink, setDeepLink] = useState<SocialDeepLink | null>(null);
  const [navHidden, setNavHidden] = useState(false);
  const [bgReady, setBgReady] = useState(false);
  const [onboarded, setOnboardedState] = useState<boolean | null>(null);
  const [firstVisit, setFirstVisit] = useState(false);
  const [bubbleTrigger, setBubbleTrigger] = useState(0);
  const [greetPending, setGreetPending] = useState(true);
  const [primingSeen, setPrimingSeen] = useState(false);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    canRetry: boolean;
  } | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [vpnWarning, setVpnWarning] = useState(false);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [playlistInfo, setPlaylistInfo] = useState<VideoInfo | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const { downloads, startDownload, clearDownloads } = useDownload(info);
  const [mode, setMode] = useState<DownloadMode>('mp4');
  const dismissedRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const successRef = useRef<{ isAudio: boolean; uri?: string }>({
    isAudio: false,
    uri: undefined,
  });
  const [successSignal, setSuccessSignal] = useState(0);
  const { paste, readClipboard } = useClipboardPaste(setLink);
  const notifPriming = useNotificationPriming(onboarded === true);
  useEffect(() => {
    void getOnboarded().then((value) => {
      setOnboardedState(value);
      if (value === false) setFirstVisit(true);
    });
  }, []);
  useEffect(() => {
    if (!greetPending) return undefined;
    if (notifPriming.visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sheet visit once
      setPrimingSeen(true);
      return undefined;
    }
    if (primingSeen) {
      setGreetPending(false);
      setBubbleTrigger((count) => count + 1);
      return undefined;
    }
    if (onboarded !== true) return undefined;
    const timer = setTimeout(() => {
      setGreetPending(false);
      setBubbleTrigger((count) => count + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [greetPending, primingSeen, notifPriming.visible, onboarded]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (tab !== 'home' || link.trim()) return;
      void (async () => {
        const enabled = await getAutoPaste();
        if (!enabled) return;
        const text = await readClipboard();
        if (text) setLink(text);
      })();
    });
    return () => sub.remove();
  }, [tab, link, readClipboard]);
  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setInvalidLink(false);
    setInfo(null);
    setLink('');
    setLoading(false);
    clearDownloads();
    dismissedRef.current = false;
    setResetSignal((prev) => prev + 1);
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    setRefreshing(false);
  };
  useEffect(() => {
    void registerDownloadService();
    void loadHaptics();
    prewarmClientId();
    void initPush();
    const unsubscribe = addDownloadTapListener(() => {
      void openSavedTarget(successRef.current);
    });
    const unsubscribeSocial = addSocialTapListener((link) => {
      setTab('updates');
      setVisited((v) => (v.updates ? v : { ...v, updates: true }));
      setDeepLink(link);
    });
    return () => {
      unsubscribe();
      unsubscribeSocial();
    };
  }, []);
  useEffect(() => scheduleIdle(() => setBgReady(true)), []);
  // prewarm tabs idle → first tap instant, heavy work gated behind visible
  useEffect(
    () =>
      scheduleIdle(() =>
        setVisited({ downloads: true, settings: true, updates: true })
      ),
    []
  );
  const handleResolve = async () => {
    if (!link.trim() || loading) return;
    tapImpact();
    // vpn check non-blocking
    void isVpnActive()
      .then(setVpnWarning)
      .catch(() => setVpnWarning(false));
    const url = cleanUrl(link);
    dismissedRef.current = false;
    setLoading(true);
    setError(null);
    setInvalidLink(false);
    setInfo(null);
    clearDownloads();
    log('Resolve', url);
    try {
      const result = await resolve(url, (partial) => {
        if (!dismissedRef.current) setInfo(partial);
      });
      if (!result) {
        if (!dismissedRef.current) {
          setInfo(null);
          setInvalidLink(true);
        }
        return;
      }
      if (result.playlist) {
        setPlaylistInfo(result);
        setPlaylistOpen(true);
        return;
      }
      if (!dismissedRef.current) setInfo(result);
      if (process.env.EXPO_PUBLIC_E2E === '1') {
        console.log(
          `[E2E_META] ${JSON.stringify({
            title: result.title,
            uploader: result.uploader,
            hasThumb: Boolean(result.thumbnail),
            formats: result.formats.length,
            anyFilesize: result.formats.some((f) => (f.filesize ?? 0) > 0),
            anyResolution: result.formats.some((f) =>
              Boolean(f.resolution || f.height)
            ),
            audioOnly:
              result.formats.length > 0 &&
              result.formats.every((f) => !f.isVideo),
          })}`
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      const canRetry = !(e instanceof ExtractorError) || e.retryable;
      logError('Resolve', `failed: ${message}`);
      if (!dismissedRef.current) {
        setInfo(null);
        setError({ message, canRetry });
      }
    } finally {
      setLoading(false);
    }
  };
  const handlePlaylistClose = useCallback(() => {
    setPlaylistOpen(false);
    setPlaylistInfo(null);
  }, []);
  const closePicker = () => {
    dismissedRef.current = true;
    setInfo(null);
  };
  const onDownload = async (format: Format, meta?: DownloadMeta) => {
    setError(null);
    const result = await startDownload(format, meta);
    if (result.status === 'error') {
      setError({ message: result.message, canRetry: true });
      return;
    }
    if (result.status === 'saved') {
      closePicker();
      const isAudio = format.isAudio && !format.isVideo;
      const target = { isAudio, uri: result.uri };
      successRef.current = target;
      setSuccessSignal((count) => count + 1);
    }
  };
  const tabHistory = useRef<Tab[]>([]);
  const goTab = (next: Tab, opts: { fromBack?: boolean } = {}) => {
    if (!opts.fromBack && next !== tab) {
      if (next === 'home') tabHistory.current = [];
      else tabHistory.current = [...tabHistory.current, tab];
    }
    setTab(next);
    if (next === 'downloads' || next === 'settings' || next === 'updates') {
      setVisited((v) => (v[next] ? v : { ...v, [next]: true }));
    }
  };
  // back: walk tab stack → home, home owns exit
  useBackHandler(() => {
    if (tabHistory.current.length > 0) {
      const prev = tabHistory.current[tabHistory.current.length - 1];
      tabHistory.current = tabHistory.current.slice(0, -1);
      setTab(prev);
      return true;
    }
    if (tab !== 'home') {
      setTab('home');
      return true;
    }
    return false;
  }, -100);
  const onLayoutRoot = useCallback(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={tw`flex-1 bg-background`}>
        <KeyboardProvider preload>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView
              style={tw`flex-1 bg-background`}
              onLayout={onLayoutRoot}
            >
              <StatusBar barStyle="light-content" backgroundColor="#030014" />
              {bgReady && (
                <Animated.View
                  entering={FadeIn.duration(450)}
                  pointerEvents="none"
                  style={tw`absolute inset-0`}
                >
                  {tab === 'home' && <TwinkleStars />}
                  {tab === 'home' && <ShootingStars />}
                </Animated.View>
              )}
              <View
                style={[
                  tw`flex-1`,
                  tab === 'home'
                    ? undefined
                    : { transform: [{ translateX: -10000 }] },
                ]}
                pointerEvents={tab === 'home' ? 'auto' : 'none'}
              >
                <HomeScreen
                  link={link}
                  onChangeLink={(text) => {
                    setLink(text);
                    setInvalidLink(false);
                  }}
                  loading={loading}
                  mode={mode}
                  setMode={setMode}
                  onResolve={() => void handleResolve()}
                  onPaste={() => void paste()}
                  onInputFocus={() => {}}
                  refreshing={refreshing}
                  onRefresh={() => void onRefresh()}
                  resetSignal={resetSignal}
                  focusSignal={homeFocus}
                  firstVisit={firstVisit}
                  bubbleTrigger={bubbleTrigger}
                  pickerOpen={!!info}
                  active={tab === 'home'}
                  muted={notifPriming.visible}
                  invalidLink={invalidLink}
                  successSignal={successSignal}
                />
              </View>
              {visited.settings && (
                <SettingsScreen
                  visible={tab === 'settings'}
                  onFullScreen={setNavHidden}
                />
              )}
              {visited.downloads && (
                <DownloadsScreen visible={tab === 'downloads'} />
              )}
              {visited.updates && (
                <UpdatesScreen
                  visible={tab === 'updates'}
                  onFullScreen={setNavHidden}
                  deepLink={deepLink}
                  onDeepLinkHandled={() => setDeepLink(null)}
                />
              )}
              <BottomNav
                tab={tab}
                onChange={goTab}
                hidden={navHidden || playlistOpen}
              />
              {playlistOpen && playlistInfo ? (
                <PlaylistPanel
                  info={playlistInfo}
                  visible={playlistOpen}
                  onClose={handlePlaylistClose}
                />
              ) : null}
              {info?.extractorKey === 'spotify' ? (
                <SpotifyPickerModal
                  info={info}
                  visible={!!info}
                  downloads={downloads}
                  vpnWarning={vpnWarning}
                  onClose={closePicker}
                  onDownload={(format, meta) => void onDownload(format, meta)}
                />
              ) : (
                <PickerModal
                  info={info}
                  downloads={downloads}
                  preferAudio={mode === 'mp3'}
                  vpnWarning={vpnWarning}
                  onClose={closePicker}
                  onDownload={(format, meta) => void onDownload(format, meta)}
                />
              )}
              <ErrorSheet
                open={!!error}
                message={error?.message ?? ''}
                onClose={() => setError(null)}
                onRetry={() => {
                  void handleResolve();
                }}
                canRetry={error?.canRetry ?? true}
              />
              <YouTubeExtractorWebView />
              <InstagramExtractorWebView />
              <GenericExtractorWebView />
              <NotificationPermissionSheet
                visible={notifPriming.visible}
                onAllow={() => void notifPriming.allow()}
                onDismiss={() => void notifPriming.dismiss()}
              />
            </SafeAreaView>
            {onboarded === false && (
              <Animated.View
                exiting={FadeOut.duration(500)}
                style={[tw`absolute inset-0`, { elevation: 100, zIndex: 100 }]}
              >
                <OnboardingScreen
                  onDone={() => {
                    setOnboardedState(true);
                    void setOnboarded(true);
                  }}
                />
              </Animated.View>
            )}
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <AppDialogProvider>
        <AppRoot />
      </AppDialogProvider>
    </ErrorBoundary>
  );
}
