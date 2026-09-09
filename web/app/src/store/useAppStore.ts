import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { VideoInfo, FinalResponse } from '@phantom/shared/schemas/media.schema';

export interface AppState {
  backendUrl: string;
  url: string;
  loading: boolean;
  error: string;
  selectedFormat: string;
  videoTitle: string;
  showPlayer: boolean;
  playerData: FinalResponse | null;
  clientId: string;

  status: string;
  emePhase: 'download' | 'mux' | null;
  emeProgress: number;
  emeBytes: { received: number; total: number } | null;
  subStatus: string;
  progress: number;
  targetProgress: number;
  desktopLogs: string[];
  sessionStartTime: number | null;
  pendingSubStatuses: string[];
  videoData: VideoInfo | null;
  isPickerOpen: boolean;
  downloadStarted: boolean;

  setSessionStartTime: (time: number | null) => void;
  setUrl: (url: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setSelectedFormat: (format: string) => void;
  setVideoTitle: (title: string) => void;
  setShowPlayer: (show: boolean) => void;
  setPlayerData: (data: FinalResponse | null) => void;
  setVideoData: (
    updater: VideoInfo | null | ((prev: VideoInfo | null) => VideoInfo | null)
  ) => void;
  setIsPickerOpen: (open: boolean) => void;
  setDownloadStarted: (started: boolean) => void;
  setClientId: (id: string) => void;
  setStatus: (status: string) => void;
  setEmePhase: (phase: 'download' | 'mux' | null) => void;
  setEmeProgress: (progress: number) => void;
  setEmeBytes: (bytes: { received: number; total: number } | null) => void;
  setSubStatus: (subStatus: string) => void;
  setProgress: (updater: number | ((prev: number) => number)) => void;
  setTargetProgress: (updater: number | ((prev: number) => number)) => void;
  setDesktopLogs: (updater: string[] | ((prev: string[]) => string[])) => void;
  setPendingSubStatuses: (
    updater: string[] | ((prev: string[]) => string[])
  ) => void;
  setBackendUrl: (url: string) => void;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    backendUrl: '',
    url: '',
    loading: false,
    error: '',
    selectedFormat: 'mp4',
    videoTitle: '',
    showPlayer: false,
    playerData: null,
    clientId: (() => {
      const saved =
        typeof window !== 'undefined'
          ? localStorage.getItem('phantom_client_id')
          : null;
      if (saved) return saved;
      const newId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().split('-')[0]
          : (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0)
              .toString(36)
              .slice(0, 8);
      if (typeof window !== 'undefined')
        localStorage.setItem('phantom_client_id', newId);
      return newId;
    })(),

    status: 'idle',
    emePhase: null,
    emeProgress: 0,
    emeBytes: null,
    subStatus: '',
    progress: 0,
    targetProgress: 0,
    desktopLogs: [],
    sessionStartTime: null,
    pendingSubStatuses: [],
    videoData: null,
    isPickerOpen: false,
    downloadStarted: false,

    setSessionStartTime: (time) => set({ sessionStartTime: time }),
    setUrl: (url) => set({ url }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setSelectedFormat: (selectedFormat) => set({ selectedFormat }),
    setVideoTitle: (videoTitle) => set({ videoTitle }),
    setShowPlayer: (showPlayer) => set({ showPlayer }),
    setPlayerData: (playerData) => set({ playerData }),
    setVideoData: (updater) =>
      set((state) => ({
        videoData:
          typeof updater === 'function'
            ? (updater as (prev: VideoInfo | null) => VideoInfo | null)(
                state.videoData
              )
            : updater,
      })),
    setIsPickerOpen: (open) => set({ isPickerOpen: open }),
    setDownloadStarted: (downloadStarted) => set({ downloadStarted }),
    setClientId: (id) => set({ clientId: id }),
    setStatus: (status) => set({ status }),
    setEmePhase: (emePhase) => set({ emePhase }),
    setEmeProgress: (emeProgress) => set({ emeProgress }),
    setEmeBytes: (emeBytes) => set({ emeBytes }),
    setSubStatus: (subStatus) => set({ subStatus }),
    setProgress: (updater: number | ((prev: number) => number)): void =>
      set((state) => {
        const nextVal =
          typeof updater === 'function' ? updater(state.progress) : updater;
        const numeric = Number(nextVal);
        if (isNaN(numeric)) return state;
        return { progress: numeric };
      }),
    setTargetProgress: (updater: number | ((prev: number) => number)) =>
      set((state) => {
        const nextVal =
          typeof updater === 'function'
            ? updater(state.targetProgress)
            : updater;
        const numeric = Number(nextVal);
        if (isNaN(numeric)) return state;
        return { targetProgress: numeric };
      }),
    setDesktopLogs: (updater) =>
      set((state) => ({
        desktopLogs:
          typeof updater === 'function'
            ? (updater as (prev: string[]) => string[])(state.desktopLogs)
            : updater,
      })),
    setPendingSubStatuses: (updater) =>
      set((state) => ({
        pendingSubStatuses:
          typeof updater === 'function'
            ? (updater as (prev: string[]) => string[])(
                state.pendingSubStatuses
              )
            : updater,
      })),

    setBackendUrl: (url) => {
      let trimmed = url;
      while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
      set({ backendUrl: trimmed });
    },
  }))
);
