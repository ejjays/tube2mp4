import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  CircleHelp,
} from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import tw from '../lib/tw';
import KeyboardAvoidingForm from './KeyboardAvoidingForm';
import { CookieIcon } from './icons';
import { checkBilibiliCookie, checkYoutubeCookie } from '../lib/cookieCheck';

function VideoEmbed({ id }: { id: string }) {
  const origin = 'https://com.phantom.app';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="https://www.youtube.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(origin)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
  return (
    <View style={tw`w-full overflow-hidden rounded-t-2xl bg-black`}>
      <WebView
        source={{ html, baseUrl: origin }}
        style={{ height: 200, width: '100%', backgroundColor: 'black' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        originWhitelist={['*']}
        mixedContentMode="always"
      />
    </View>
  );
}

type Status = 'valid' | 'invalid' | 'checking' | 'empty';

function PlatformRow({
  name,
  status,
  onPress,
  last,
}: {
  name: string;
  status: Status;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.03)' }}
    >
      <View
        style={[
          tw`flex-row items-center px-5 py-4`,
          last ? null : tw`border-b border-white/5`,
        ]}
      >
        <View style={tw`flex-1`}>
          <Text style={tw`font-sans-medium text-[15px] text-white`}>
            {name}
          </Text>
        </View>
        {status === 'checking' ? (
          <View style={tw`mr-2 rounded-full bg-white/10 px-2.5 py-1`}>
            <Text style={tw`font-sans-medium text-[12px] text-slate-300`}>
              Checking…
            </Text>
          </View>
        ) : status === 'valid' ? (
          <View style={tw`mr-2 rounded-full bg-green-500/15 px-2.5 py-1`}>
            <Text style={tw`font-sans-semibold text-[12px] text-green-400`}>
              Valid
            </Text>
          </View>
        ) : status === 'invalid' ? (
          <View style={tw`mr-2 rounded-full bg-red-500/15 px-2.5 py-1`}>
            <Text style={tw`font-sans-semibold text-[12px] text-red-400`}>
              Invalid
            </Text>
          </View>
        ) : null}
        <ChevronRight size={18} color="#475569" />
      </View>
    </Pressable>
  );
}

export default function CookieListPanel({
  youtubeCookie,
  bilibiliCookie,
  onOpen,
  onBack,
}: {
  youtubeCookie: string;
  bilibiliCookie: string;
  onOpen: (platform: 'youtube' | 'bilibili') => void;
  onBack: () => void;
}) {
  const [youtubeStatus, setYoutubeStatus] = useState<Status>('empty');
  const [bilibiliStatus, setBilibiliStatus] = useState<Status>('empty');
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runChecks = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const hasAny = Boolean(youtubeCookie.trim() || bilibiliCookie.trim());
    if (!hasAny) {
      setYoutubeStatus('empty');
      setBilibiliStatus('empty');
      setChecking(false);
      return;
    }
    const start = Date.now();
    setChecking(true);
    setYoutubeStatus(youtubeCookie.trim() ? 'checking' : 'empty');
    setBilibiliStatus(bilibiliCookie.trim() ? 'checking' : 'empty');

    const yt = youtubeCookie.trim()
      ? checkYoutubeCookie(youtubeCookie).status
      : 'empty';
    const biliRaw = bilibiliCookie.trim()
      ? checkBilibiliCookie(bilibiliCookie).status
      : 'empty';

    const ytStatus: Status =
      yt === 'valid' ? 'valid' : yt === 'invalid' ? 'invalid' : 'empty';
    const biliStatus: Status =
      biliRaw === 'valid' || biliRaw === 'unverified'
        ? 'valid'
        : biliRaw === 'invalid'
          ? 'invalid'
          : 'empty';

    const elapsed = Date.now() - start;
    const wait = Math.max(0, 2000 - elapsed);
    timerRef.current = setTimeout(() => {
      setYoutubeStatus(ytStatus);
      setBilibiliStatus(biliStatus);
      setChecking(false);
    }, wait);
  }, [youtubeCookie, bilibiliCookie]);

  useEffect(() => {
    runChecks();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runChecks]);

  return (
    <KeyboardAvoidingForm contentContainerStyle={tw`px-5 pb-36 pt-14`}>
      <View style={[tw`w-full self-center`, { maxWidth: 600 }]}>
        <View style={tw`h-10 flex-row items-center justify-center`}>
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={tw`absolute left-0 h-10 w-10 items-center justify-center rounded-full bg-white/10`}
          >
            <ChevronLeft size={22} color="#e2e8f0" strokeWidth={2.2} />
          </Pressable>
          <Text style={tw`font-sans-semibold text-[18px] text-white`}>
            Cookies
          </Text>
          <Pressable
            onPress={runChecks}
            hitSlop={8}
            disabled={checking}
            style={tw`absolute right-0 h-10 w-10 items-center justify-center rounded-full bg-white/10`}
          >
            {checking ? (
              <ActivityIndicator size="small" color="#e2e8f0" />
            ) : (
              <RefreshCw size={18} color="#e2e8f0" strokeWidth={2.2} />
            )}
          </Pressable>
        </View>

        <View style={tw`mt-8 overflow-hidden rounded-3xl bg-white/10`}>
          <PlatformRow
            name="YouTube"
            status={youtubeStatus}
            onPress={() => onOpen('youtube')}
          />
          <PlatformRow
            name="Bilibili"
            status={bilibiliStatus}
            onPress={() => onOpen('bilibili')}
            last
          />
        </View>

        <View
          style={tw`mt-8 w-full overflow-hidden rounded-[28px] border border-violet-800/20 bg-violet-900`}
        >
          <View style={tw`p-6`}>
            <View style={tw`flex-row items-center`}>
              <Info size={18} color="#ede9fe" />
              <Text
                style={tw`ml-2.5 font-sans-semibold text-[15px] text-white`}
              >
                About cookies
              </Text>
              <View style={tw`ml-auto`}>
                <CookieIcon size={22} />
              </View>
            </View>

            <View style={tw`mt-5 h-[1px] bg-white/10`} />

            <View style={tw`mt-5 flex-row items-start`}>
              <View
                style={tw`mt-[7px] h-1.5 w-1.5 rounded-full bg-emerald-300`}
              />
              <View style={tw`ml-3 flex-1`}>
                <Text style={tw`font-sans-semibold text-[14px] text-white`}>
                  What is it
                </Text>
                <Text
                  style={tw`mt-1 font-sans text-[13.5px] leading-5 text-violet-100/90`}
                >
                  A cookie is your{' '}
                  <Text style={tw`font-sans-semibold text-cyan-300`}>
                    {`"real account's identity"`}
                  </Text>{' '}
                  {`(data) consisting of texts that's saved in a browser after you logged in to specific platforms.`}
                </Text>
              </View>
            </View>

            <View style={tw`mt-5 flex-row items-start`}>
              <View
                style={tw`mt-[7px] h-1.5 w-1.5 rounded-full bg-emerald-300`}
              />
              <View style={tw`ml-3 flex-1`}>
                <Text style={tw`font-sans-semibold text-[14px] text-white`}>
                  When needed
                </Text>
                <Text
                  style={tw`mt-1 font-sans text-[13.5px] leading-5 text-violet-100/90`}
                >
                  Used when a platform blocks the access without a real account.
                  Examples include:{'\n\n'}
                  <Text style={tw`text-white`}>-</Text>{' '}
                  <Text style={tw`font-sans-medium text-violet-100`}>
                    YouTube
                  </Text>
                  : private / members-only / age-restricted your account can
                  already watch.{'\n'}
                  <Text style={tw`text-white`}>-</Text>{' '}
                  <Text style={tw`font-sans-medium text-violet-100`}>
                    Bilibili
                  </Text>
                  : high-quality streams (1080p+) that require login.
                </Text>
              </View>
            </View>

            <View style={tw`mt-5 flex-row items-start`}>
              <View
                style={tw`mt-[7px] h-1.5 w-1.5 rounded-full bg-emerald-300`}
              />
              <View style={tw`ml-3 flex-1`}>
                <Text style={tw`font-sans-semibold text-[14px] text-white`}>
                  Leave blank if
                </Text>
                <Text
                  style={tw`mt-1 font-sans text-[13.5px] leading-5 text-violet-100/90`}
                >
                  {`Downloads already work. Most videos don't need this.`}
                </Text>
              </View>
            </View>

            <View style={tw`mt-6 h-[1px] bg-white/10`} />

            <View style={tw`mt-5 flex-row items-center`}>
              <CircleHelp size={18} color="#ede9fe" />
              <Text
                style={tw`ml-2.5 font-sans-semibold text-[15px] text-white`}
              >
                How to get cookies
              </Text>
            </View>
            <Text
              style={tw`mt-1 font-sans text-[12.5px] leading-5 text-violet-200`}
            >
              This tutorial shows how you can get cookies using your phone
            </Text>
          </View>

          <VideoEmbed id="7yNvsFrwpp0" />
        </View>
      </View>
    </KeyboardAvoidingForm>
  );
}
