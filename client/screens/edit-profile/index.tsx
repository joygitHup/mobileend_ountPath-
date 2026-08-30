import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/utils/api';
import { uploadMedia } from '@/utils/upload';

interface MeProfile {
  name: string;
  bio: string;
  avatar_url: string;
  verified: boolean;
  verified_label: string;
  phone: string;
}

function notify(type: 'success' | 'error' | 'info', title: string, message?: string) {
  Toast.show({
    type: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: 2200,
  });
}

function withCacheBust(url: string) {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_=${Date.now()}`;
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [displayAvatar, setDisplayAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchApi<{ data: MeProfile }>('/api/v1/me/profile')
        .then((res) => {
          const data = res.data;
          setProfile(data);
          setName(data.name || '');
          setBio(data.bio || '');
          setAvatarUrl(data.avatar_url || '');
          setDisplayAvatar(data.avatar_url || '');
        })
        .catch(() => setProfile(null));
    }, [])
  );

  const save = async () => {
    if (!name.trim()) {
      notify('error', '请填写昵称');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetchApi<{ data: MeProfile }>('/api/v1/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim(),
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        }),
      });
      const data = res.data;
      updateUser({
        name: data.name,
        avatar_url: data.avatar_url || avatarUrl,
      });
      setProfile(data);
      notify('success', '已保存', '个人信息已更新');
      // Web 上 Alert 带按钮常无响应，保存后直接返回
      setTimeout(() => router.back(), Platform.OS === 'web' ? 400 : 200);
    } catch (e) {
      notify('error', '保存失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('error', '需要相册权限', '请允许访问相册后更换头像');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: Platform.OS !== 'web',
      aspect: [1, 1],
      quality: 0.85,
      base64: Platform.OS === 'web',
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const local =
        Platform.OS === 'web' && asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
      const url = await uploadMedia(local, 'avatar.jpg');
      const res = await fetchApi<{ data: MeProfile }>('/api/v1/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: url }),
      });
      const saved = res.data?.avatar_url || url;
      setAvatarUrl(saved);
      setDisplayAvatar(withCacheBust(saved));
      setProfile((prev) => (prev ? { ...prev, ...res.data, avatar_url: saved } : prev));
      updateUser({ avatar_url: saved, name: res.data?.name });
      notify('success', '头像已更新', '可继续修改资料后点保存');
    } catch (e) {
      notify('error', '上传失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const verify = async () => {
    try {
      const res = await fetchApi<{ data: MeProfile }>('/api/v1/me/verify', { method: 'POST' });
      setProfile(res.data);
      notify('success', '认证成功', '已完成实名认证（演示）');
    } catch (e) {
      notify('error', '认证失败', e instanceof Error ? e.message : '请稍后重试');
    }
  };

  if (!profile) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2D6A4F" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: insets.top + 8 }} className="px-5">
          <View className="flex-row items-center mb-6">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
            >
              <FontAwesome6 name="chevron-left" size={16} color="#2D6A4F" />
            </TouchableOpacity>
            <Text className="text-2xl font-bold text-foreground">编辑资料</Text>
          </View>

          <View className="items-center mb-6">
            <TouchableOpacity
              onPress={pickAvatar}
              disabled={uploadingAvatar}
              activeOpacity={0.8}
              className="relative"
            >
              <Image
                source={{ uri: displayAvatar || profile.avatar_url }}
                style={{ width: 88, height: 88, borderRadius: 44 }}
                contentFit="cover"
              />
              <View
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: '#2D6A4F' }}
              >
                {uploadingAvatar ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <FontAwesome6 name="camera" size={12} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <Text className="text-xs text-muted mt-2">
              {uploadingAvatar ? '头像上传中…' : '点击更换头像（上传至服务器）'}
            </Text>
          </View>

          <Text className="text-sm font-semibold text-foreground mb-2">昵称</Text>
          <TextInput value={name} onChangeText={setName} style={inputStyle} placeholderTextColor="#A89888" />

          <Text className="text-sm font-semibold text-foreground mb-2 mt-4">简介</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            multiline
            style={[inputStyle, { minHeight: 96, textAlignVertical: 'top' }]}
            placeholderTextColor="#A89888"
          />

          <View
            className="mt-5 p-4 flex-row items-center justify-between"
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 18,
            }}
          >
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-foreground">实名认证（演示）</Text>
              <Text className="text-xs text-muted mt-1">
                {profile.verified_label} · 当前为一键演示标记，非真实 KYC
              </Text>
            </View>
            {profile.verified ? (
              <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(45,106,79,0.12)' }}>
                <Text className="text-xs font-bold" style={{ color: '#2D6A4F' }}>演示已认证</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={verify} className="px-3 py-2 rounded-full" style={{ backgroundColor: '#2D6A4F' }}>
                <Text className="text-xs font-bold text-white">演示认证</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={save}
            disabled={saving || uploadingAvatar}
            className="mt-6 py-4 items-center"
            style={{
              backgroundColor: saving || uploadingAvatar ? 'rgba(45,106,79,0.45)' : '#2D6A4F',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 22,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold">保存</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const inputStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  fontSize: 16,
  color: '#3D3229',
  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
};
