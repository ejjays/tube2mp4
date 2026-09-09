import { isHost } from '../lib/utils';
import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { BACKEND_URL } from '../lib/config';
import { VideoInfo, FinalResponse } from '@phantom/shared/schemas/media.schema';
import { filterUnsupportedCodecs } from '../lib/codec-support';

// sanitize video metadata
function _mapVideoMetadata(data: VideoInfo, backendUrl: string): VideoInfo {
  const result = { ...data };

  if (result.thumbnail?.includes('localhost:5000')) {
    result.thumbnail = result.thumbnail.replace(
      /http:\/\/localhost:5000/g,
      backendUrl
    );
  }
  if (result.cover?.includes('localhost:5000')) {
    result.cover = result.cover.replace(/http:\/\/localhost:5000/g, backendUrl);
  }

  return result;
}

const _getCleanedUrl = (url: string) => {
  let cleaned = url;
  if (cleaned.includes('%')) {
    try {
      const decoded = decodeURIComponent(cleaned);
      if (decoded.startsWith('http')) cleaned = decoded;
    } catch (_e) {
      /* ignore */
    }
  }
  return cleaned.split('&id=')[0].split('?id=')[0];
};

const _handleFetchError = async (response: Response) => {
  let errorMsg = 'Failed to fetch video details';
  try {
    const errJson = await response.json();
    if (errJson.error) errorMsg = errJson.error;
  } catch (_e) {
    /* ignore */
  }
  throw new Error(`${errorMsg} (${response.status})`);
};

export const useVideoInfo = () => {
  const backendUrl = useAppStore((state) => state.backendUrl) || BACKEND_URL;
  const clientId = useAppStore((state) => state.clientId);
  const url = useAppStore((state) => state.url);
  const setVideoData = useAppStore((state) => state.setVideoData);
  const setIsPickerOpen = useAppStore((state) => state.setIsPickerOpen);
  const setDownloadStarted = useAppStore((state) => state.setDownloadStarted);
  const setStatus = useAppStore((state) => state.setStatus);
  const setTargetProgress = useAppStore((state) => state.setTargetProgress);
  const setSubStatus = useAppStore((state) => state.setSubStatus);
  const setPendingSubStatuses = useAppStore(
    (state) => state.setPendingSubStatuses
  );
  const setDesktopLogs = useAppStore((state) => state.setDesktopLogs);
  const setSessionStartTime = useAppStore(
    (state) => state.setSessionStartTime
  );
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);
  const setSelectedFormat = useAppStore((state) => state.setSelectedFormat);
  const setPlayerData = useAppStore((state) => state.setPlayerData);
  const setShowPlayer = useAppStore((state) => state.setShowPlayer);

  const _handleSpotifyPlayer = useCallback(
    (updatedData: VideoInfo, finalUrl: string, data: VideoInfo) => {
      const spotify = updatedData.spotifyMetadata;
      if (spotify?.previewUrl) {
        setSelectedFormat('mp3');
        setPlayerData({
          ...updatedData,
          id: spotify.id || updatedData.id,
          title: spotify.title || updatedData.title,
          artist: spotify.artist || updatedData.artist,
          uploader: spotify.artist || updatedData.uploader,
          album: spotify.album || updatedData.album || '',
          cover:
            spotify.cover ||
            spotify.imageUrl ||
            updatedData.cover ||
            '/logo.webp',
          thumbnail:
            spotify.thumbnail ||
            spotify.imageUrl ||
            updatedData.thumbnail ||
            updatedData.cover ||
            '/logo.webp',
          previewUrl: spotify.previewUrl,
          formats: updatedData.formats || [],
          audioFormats: updatedData.audioFormats || [],
          isPartial: updatedData.isPartial || false,
          isIsrcMatch: data.isIsrcMatch || false,
          webpageUrl: data.webpageUrl || finalUrl,
        } as FinalResponse);
        setShowPlayer(true);
      }
    },
    [setSelectedFormat, setPlayerData, setShowPlayer]
  );

  const fetchInfo = useCallback(
    async (inputUrl?: string) => {
      const finalUrl = typeof inputUrl === 'string' ? inputUrl : url;
      if (!finalUrl || typeof finalUrl !== 'string') return;

      const cleanedUrl = _getCleanedUrl(finalUrl);

      setLoading(true);
      setError('');

      if (useAppStore.getState().videoData?.webpageUrl !== cleanedUrl) {
        setVideoData(null);
      }

      setIsPickerOpen(false);
      setDownloadStarted(false);
      setStatus('fetching_info');
      setTargetProgress(10);
      setSubStatus('Initializing Engine...');
      setPendingSubStatuses([]);
      setSessionStartTime(Date.now());
      setDesktopLogs(['[0:00] Initializing Phantom Core Engine...']);

      try {
        const response = await fetch(
          `${backendUrl}/info?url=${encodeURIComponent(cleanedUrl)}&id=${clientId}`,
          {
            headers: {
              'ngrok-skip-browser-warning': 'true',
              'bypass-tunnel-reminder': 'true',
            },
          }
        );

        if (!response.ok) {
          await _handleFetchError(response);
        }

        const data = (await response.json()) as VideoInfo;
        const updatedData = _mapVideoMetadata(data, backendUrl);

        setVideoData((prev: VideoInfo | null) => {
          const newFormats = Array.isArray(updatedData.formats)
            ? updatedData.formats
            : [];
          const newAudioFormats = Array.isArray(updatedData.audioFormats)
            ? updatedData.audioFormats
            : [];
          const prevFormats = Array.isArray(prev?.formats)
            ? (prev?.formats ?? [])
            : [];
          const prevAudioFormats = Array.isArray(prev?.audioFormats)
            ? (prev?.audioFormats ?? [])
            : [];

          /**
           * Keep whichever format list is fuller. The yt-dlp enhancement SSE
           * event can arrive with the comprehensive list (e.g. 16 entries
           * covering 4K -> 144p) before the second /info HTTP response lands
           * with Innertube's limited subset; without this, the lean HTTP
           * response would clobber the rich SSE payload.
           */
          const finalFormats =
            newFormats.length >= prevFormats.length ? newFormats : prevFormats;
          const finalAudioFormats =
            newAudioFormats.length >= prevAudioFormats.length
              ? newAudioFormats
              : prevAudioFormats;

          const hasFormats = finalFormats.length > 0;

          return {
            ...prev,
            ...updatedData,
            formats: filterUnsupportedCodecs(finalFormats),
            audioFormats: finalAudioFormats,
            isPartial:
              updatedData.isPartial !== undefined
                ? updatedData.isPartial && !hasFormats
                : !hasFormats,
            previewUrl:
              updatedData.previewUrl ||
              updatedData.spotifyMetadata?.previewUrl ||
              prev?.previewUrl,
          } as VideoInfo;
        });

        if (isHost(finalUrl, 'spotify.com')) {
          _handleSpotifyPlayer(updatedData, finalUrl, data);
        }

        // open immediately
        if (updatedData.title && updatedData.title !== 'Unknown') {
          setIsPickerOpen(true);
        }

        // fallback hydration
        if (updatedData.isPartial) {
          fetch(
            `${backendUrl}/info?url=${encodeURIComponent(cleanedUrl)}&id=${clientId}`,
            {
              headers: {
                'ngrok-skip-browser-warning': 'true',
                'bypass-tunnel-reminder': 'true',
              },
            }
          )
            .then((res) => res.json())
            .then((hydrationData: VideoInfo) => {
              if (hydrationData.formats && hydrationData.formats.length > 0) {
                setVideoData((prev: VideoInfo | null) => {
                  const hydrated = _mapVideoMetadata(hydrationData, backendUrl);
                  const newFormats = hydrated.formats || [];
                  const newAudioFormats = hydrated.audioFormats || [];
                  const prevFormats = prev?.formats || [];
                  const prevAudioFormats = prev?.audioFormats || [];

                  /**
                   * Keep the fuller list. By the time this hydration call
                   * returns, the SSE channel may already have pushed the
                   * comprehensive yt-dlp format set.
                   */
                  const finalFormats =
                    newFormats.length >= prevFormats.length
                      ? newFormats
                      : prevFormats;
                  const finalAudioFormats =
                    newAudioFormats.length >= prevAudioFormats.length
                      ? newAudioFormats
                      : prevAudioFormats;

                  return {
                    ...prev,
                    ...hydrated,
                    formats: filterUnsupportedCodecs(finalFormats),
                    audioFormats: finalAudioFormats,
                    isPartial: false,
                  } as VideoInfo;
                });
              }
            })
            .catch(() => {
              /* silent fallback */
            });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [
      url,
      backendUrl,
      clientId,
      setStatus,
      setTargetProgress,
      setSubStatus,
      setPendingSubStatuses,
      setDesktopLogs,
      setLoading,
      setError,
      setVideoData,
      setIsPickerOpen,
      setDownloadStarted,
      setSessionStartTime,
      _handleSpotifyPlayer,
    ]
  );

  return { fetchInfo };
};
