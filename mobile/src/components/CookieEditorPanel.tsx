import { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Clipboard, X } from 'lucide-react-native';
import * as ClipboardAPI from 'expo-clipboard';
import tw from '../lib/tw';
import KeyboardAvoidingForm from './KeyboardAvoidingForm';
import CyanButton from './CyanButton';
import { useAppDialog } from './AppDialog';
import type { CookieCheckResult } from '../lib/cookieCheck';

export default function CookieEditorPanel({
  title,
  value,
  onChangeValue,
  onSave,
  saving,
  onClear: _onClear,
  onCheck,
  onBack,
}: {
  title: string;
  value: string;
  onChangeValue: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  onClear: () => void;
  onCheck: (cookie: string) => CookieCheckResult | Promise<CookieCheckResult>;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const canSave = value.trim().length > 0 && !saving;
  const { showDialog } = useAppDialog();
  const inputRef = useRef<TextInput>(null);

  const runCheck = async (cookie: string) => {
    const trimmed = cookie.trim();
    if (!trimmed) {
      return;
    }
    setChecking(true);
    await onCheck(trimmed);
    setChecking(false);
  };

  const save = () => {
    if (value.includes(';') && !/=/.test(value.split(';')[0])) {
      setError(
        'That does not look like a cookie header — paste the full "name=value; …" string.'
      );
      return;
    }
    setError(null);
    onSave();
  };

  const paste = async () => {
    const text = await ClipboardAPI.getStringAsync();
    if (text) {
      setError(null);
      onChangeValue(text);
      void runCheck(text);
      requestAnimationFrame(() => {
        inputRef.current?.setNativeProps({
          selection: { start: 0, end: 0 },
        } as never);
      });
    }
  };

  const confirmClear = () => {
    if (!value) {
      onChangeValue('');
      return;
    }
    showDialog({
      title: 'Clear cookie',
      message: 'Remove this cookie?',
      confirmLabel: 'Clear',
      destructive: true,
      onConfirm: () => {
        setError(null);
        _onClear();
      },
    });
  };

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
            {title}
          </Text>
        </View>

        <View style={tw`mt-8 overflow-hidden rounded-3xl bg-white/10`}>
          <View style={tw`flex-row items-center justify-between px-5 py-4`}>
            <Text style={tw`font-sans text-[14px] text-slate-400`}>Cookie</Text>
            <View style={tw`flex-row items-center`}>
              <Pressable
                onPress={() => void paste()}
                hitSlop={10}
                style={tw`mr-3 h-8 w-8 items-center justify-center rounded-full bg-white/5`}
              >
                <Clipboard size={14} color="#94a3b8" strokeWidth={2.2} />
              </Pressable>
              <Pressable
                onPress={confirmClear}
                hitSlop={8}
                style={tw`flex-row items-center`}
              >
                <X size={14} color="#64748b" strokeWidth={2.2} />
                <Text style={tw`ml-1 font-sans text-[12px] text-slate-500`}>
                  Clear
                </Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={(next) => {
              const prevLen = value.length;
              onChangeValue(next);
              const pasted = next.length - prevLen > 10 && next.includes('=');
              if (pasted) {
                void runCheck(next);
                requestAnimationFrame(() => {
                  inputRef.current?.setNativeProps({
                    selection: { start: 0, end: 0 },
                  } as never);
                });
              }
            }}
            placeholder="Paste your cookie here…"
            placeholderTextColor="#5b6472"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor="#22d3ee"
            style={[
              tw`h-[140px] px-5 pb-5 font-sans text-[13px] leading-5 text-white`,
              { textAlignVertical: 'top' },
            ]}
          />
        </View>

        {checking ? (
          <View style={tw`mt-3 flex-row items-center justify-center`}>
            <ActivityIndicator size="small" color="#22d3ee" />
            <Text style={tw`ml-2 font-sans text-[12px] text-slate-400`}>
              Checking…
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text style={tw`ml-1 mt-2 font-sans text-[12px] text-red-400`}>
            {error}
          </Text>
        ) : null}

        <View style={tw`mt-7`}>
          <CyanButton
            label="Save cookie"
            onPress={save}
            disabled={!canSave}
            loading={saving}
          />
        </View>
      </View>
    </KeyboardAvoidingForm>
  );
}
