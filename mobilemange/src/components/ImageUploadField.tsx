import { Button, Input, Space, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { getToken } from '@/api/client';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';

type Props = {
  value?: string;
  onChange?: (url: string) => void;
};

/** 封面/图片上传：走 admin media，也可手填 URL */
export function ImageUploadField({ value, onChange }: Props) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Input
        value={value}
        placeholder="图片 URL"
        onChange={(e) => onChange?.(e.target.value)}
      />
      <Upload
        accept="image/*"
        showUploadList={false}
        customRequest={async ({ file, onSuccess, onError }) => {
          try {
            const fd = new FormData();
            fd.append('file', file as File);
            const res = await fetch(`${API_BASE}/api/v1/admin/media/upload`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${getToken() || ''}`,
              },
              body: fd,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error((json as { error?: string }).error || '上传失败');
            }
            const url = (json as { data?: { url?: string } }).data?.url;
            if (!url) throw new Error('未返回图片地址');
            onChange?.(url);
            message.success('上传成功');
            onSuccess?.(json);
          } catch (e) {
            message.error(e instanceof Error ? e.message : '上传失败');
            onError?.(e as Error);
          }
        }}
      >
        <Button icon={<UploadOutlined />}>上传封面</Button>
      </Upload>
      {value ? (
        <img
          src={value}
          alt="封面预览"
          style={{ maxWidth: 240, maxHeight: 140, borderRadius: 8, objectFit: 'cover' }}
        />
      ) : null}
    </Space>
  );
}
