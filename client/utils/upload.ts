import { Platform } from 'react-native';
import { getStoredToken } from '@/contexts/AuthContext';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

function guessMime(uri: string, filename: string): string {
  const lower = `${uri} ${filename}`.toLowerCase();
  if (lower.includes('.png') || lower.includes('image/png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.heic')) return 'image/heic';
  return 'image/jpeg';
}

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

/** 上传本地 / blob 图片到 mobileback，返回持久化 URL */
export async function uploadMedia(localUri: string, filename = 'photo.jpg'): Promise<string> {
  if (!BASE_URL) {
    throw new Error('未配置后端地址');
  }
  if (/^https?:\/\//i.test(localUri) && !localUri.startsWith('blob:')) {
    return localUri;
  }

  const token = await getStoredToken();
  const name = filename.includes('.') ? filename : `${filename}.jpg`;
  const mime = guessMime(localUri, name);

  // Web：必须用 Blob/File；{ uri } 对象在浏览器无效
  if (Platform.OS === 'web') {
    if (localUri.startsWith('data:')) {
      return uploadMediaBase64(localUri, name, mime, token);
    }
    try {
      const blob = await uriToBlob(localUri);
      const file = new File([blob], name, { type: blob.type || mime });
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE_URL}/api/v1/media/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { url?: string };
        error?: string;
      } | null;
      if (res.ok && json?.data?.url) return json.data.url;
      // fall through to base64
    } catch {
      // fall through
    }
    return uploadMediaBase64(localUri, name, mime, token);
  }

  // Native：RN FormData 文件约定
  const form = new FormData();
  form.append('file', {
    uri: localUri,
    name,
    type: mime,
  } as unknown as Blob);

  const res = await fetch(`${BASE_URL}/api/v1/media/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/json',
    },
    body: form,
  });
  const json = (await res.json().catch(() => null)) as {
    data?: { url?: string };
    error?: string;
  } | null;
  if (res.ok && json?.data?.url) {
    return json.data.url;
  }

  // Native 失败再试 base64（部分环境 multipart 异常）
  try {
    return await uploadMediaBase64(localUri, name, mime, token);
  } catch {
    throw new Error(json?.error || `上传失败 (${res.status})`);
  }
}

async function uploadMediaBase64(
  uri: string,
  filename: string,
  mime: string,
  token: string | null
): Promise<string> {
  let base64: string;
  if (uri.startsWith('data:')) {
    base64 = uri.replace(/^data:[^;]+;base64,/, '');
  } else {
    const blob = await uriToBlob(uri);
    base64 = await blobToBase64(blob);
  }
  const res = await fetch(`${BASE_URL}/api/v1/media/upload-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      filename,
      content_type: mime,
      data: base64,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: { url?: string };
    error?: string;
  } | null;
  if (!res.ok || !json?.data?.url) {
    throw new Error(json?.error || `上传失败 (${res.status})`);
  }
  return json.data.url;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function uploadMediaMany(uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    out.push(await uploadMedia(uris[i], `img_${i}.jpg`));
  }
  return out;
}
