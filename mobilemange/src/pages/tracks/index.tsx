import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type TrackItem = {
  id: string;
  title?: string;
  summary?: string;
  is_official?: boolean;
  recommended?: boolean;
  author?: string;
  distance_km?: number;
  elevation_gain_m?: number;
  annotation_count?: number;
  rating?: number;
  tags?: string[];
};

type TrackBundlePayload = {
  total?: number;
  community_count?: number;
  official_id?: string;
  recommended_id?: string;
  filter_tags?: string[];
  tracks?: TrackItem[];
};

type TrackBundle = { route_id: string; payload: TrackBundlePayload };
type PubTrack = {
  id: string;
  route_id: string;
  is_official: boolean;
  recommended: boolean;
  hidden: boolean;
  payload: TrackItem & Record<string, unknown>;
};

export default function TracksPage() {
  const qc = useQueryClient();
  const [editRoute, setEditRoute] = useState<string | null>(null);
  const [preview, setPreview] = useState<PubTrack | null>(null);
  const [form] = Form.useForm();

  const bundles = useQuery({
    queryKey: ['admin-tracks'],
    queryFn: () => api<TrackBundle[]>('/api/v1/admin/tracks'),
  });
  const published = useQuery({
    queryKey: ['admin-pub-tracks'],
    queryFn: () => api<PubTrack[]>('/api/v1/admin/published-tracks'),
  });
  const routes = useQuery({
    queryKey: ['admin-routes-for-tracks'],
    queryFn: () => api<{ id: string; name?: string }[]>('/api/v1/admin/routes'),
  });

  const openEdit = (row: TrackBundle) => {
    const p = row.payload || {};
    setEditRoute(row.route_id);
    form.setFieldsValue({
      official_id: p.official_id,
      recommended_id: p.recommended_id,
      filter_tags: (p.filter_tags || []).join(','),
      tracks: (p.tracks || []).map((t) => ({
        ...t,
        tags: Array.isArray(t.tags) ? t.tags.join(',') : '',
      })),
    });
  };

  const saveBundle = useMutation({
    mutationFn: async (values: {
      official_id?: string;
      recommended_id?: string;
      filter_tags?: string;
      tracks?: (TrackItem & { tags?: string })[];
    }) => {
      if (!editRoute) return;
      const tracks = (values.tracks || []).map((t, i) => {
        const tags = String(t.tags || '')
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean);
        const id = t.id || `trk_${editRoute}_${i + 1}`;
        return { ...t, id, tags };
      });
      if (!tracks.length) throw new Error('至少添加一条轨迹');
      const payload: TrackBundlePayload = {
        total: tracks.length,
        community_count: tracks.filter((t) => !t.is_official).length,
        official_id: values.official_id || tracks.find((t) => t.is_official)?.id || tracks[0].id,
        recommended_id:
          values.recommended_id || tracks.find((t) => t.recommended)?.id || tracks[0].id,
        filter_tags: String(values.filter_tags || '')
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean),
        tracks,
      };
      return api(`/api/v1/admin/tracks/${editRoute}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      message.success('轨迹包已保存');
      setEditRoute(null);
      qc.invalidateQueries({ queryKey: ['admin-tracks'] });
    },
    onError: (e: Error) => message.error(e.message || '保存失败'),
  });

  const createBundle = useMutation({
    mutationFn: async (routeId: string) => {
      const payload: TrackBundlePayload = {
        total: 1,
        community_count: 0,
        official_id: `trk_official_${routeId}`,
        recommended_id: `trk_official_${routeId}`,
        filter_tags: ['官方'],
        tracks: [
          {
            id: `trk_official_${routeId}`,
            title: '官方标准路线',
            summary: '示意跟线参考，不能替代精确导航。',
            is_official: true,
            recommended: true,
            author: '山途官方',
            distance_km: 10,
            elevation_gain_m: 500,
            annotation_count: 0,
            rating: 4.5,
            tags: ['官方', '标准'],
          },
        ],
      };
      return api(`/api/v1/admin/tracks/${routeId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      message.success('已创建轨迹包');
      qc.invalidateQueries({ queryKey: ['admin-tracks'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const patchPub = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      is_official?: boolean;
      recommended?: boolean;
      hidden?: boolean;
    }) => api(`/api/v1/admin/published-tracks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      message.success('已更新');
      qc.invalidateQueries({ queryKey: ['admin-pub-tracks'] });
    },
  });

  const existingIds = new Set((bundles.data || []).map((b) => b.route_id));
  const missingRoutes = (routes.data || []).filter((r) => !existingIds.has(r.id));

  return (
    <div>
      <PageHeader title={routeMeta['/tracks'].title} description="轨迹包表单编辑 · 社区轨迹预览与审核" />
      <Panel>
        <Tabs
          items={[
            {
              key: 'official',
              label: `路线轨迹包 (${bundles.data?.length ?? 0})`,
              children: (
                <>
                  {missingRoutes.length > 0 ? (
                    <Space style={{ marginBottom: 12 }} wrap>
                      <span style={{ color: '#8B7D6B' }}>缺包路线：</span>
                      {missingRoutes.slice(0, 8).map((r) => (
                        <Button
                          key={r.id}
                          size="small"
                          onClick={() => createBundle.mutate(r.id)}
                          loading={createBundle.isPending}
                        >
                          为 {r.name || r.id} 新建
                        </Button>
                      ))}
                    </Space>
                  ) : null}
                  <Table
                    rowKey="route_id"
                    loading={bundles.isLoading}
                    dataSource={bundles.data || []}
                    columns={[
                      { title: '路线 ID', dataIndex: 'route_id', width: 120 },
                      {
                        title: '轨迹数',
                        width: 90,
                        render: (_, row) => row.payload?.tracks?.length ?? 0,
                      },
                      {
                        title: '官方 ID',
                        render: (_, row) => row.payload?.official_id || '—',
                      },
                      {
                        title: '操作',
                        width: 120,
                        render: (_, row) => (
                          <Button type="link" onClick={() => openEdit(row)}>
                            表单编辑
                          </Button>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'community',
              label: '社区发布轨迹',
              children: (
                <Table
                  rowKey="id"
                  loading={published.isLoading}
                  dataSource={published.data || []}
                  columns={[
                    { title: 'ID', dataIndex: 'id', width: 130 },
                    { title: '路线', dataIndex: 'route_id', width: 100 },
                    {
                      title: '标题',
                      render: (_, row) => (row.payload?.title as string) || '—',
                      ellipsis: true,
                    },
                    {
                      title: '官方',
                      dataIndex: 'is_official',
                      width: 80,
                      render: (v: boolean, row) => (
                        <Switch
                          checked={v}
                          onChange={(c) => patchPub.mutate({ id: row.id, is_official: c })}
                        />
                      ),
                    },
                    {
                      title: '推荐',
                      dataIndex: 'recommended',
                      width: 80,
                      render: (v: boolean, row) => (
                        <Switch
                          checked={v}
                          onChange={(c) => patchPub.mutate({ id: row.id, recommended: c })}
                        />
                      ),
                    },
                    {
                      title: '隐藏',
                      dataIndex: 'hidden',
                      width: 80,
                      render: (v: boolean, row) => (
                        <Switch checked={v} onChange={(c) => patchPub.mutate({ id: row.id, hidden: c })} />
                      ),
                    },
                    {
                      title: '预览',
                      width: 90,
                      render: (_, row) => (
                        <Button type="link" onClick={() => setPreview(row)}>
                          查看
                        </Button>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Panel>

      <Modal
        title={`编辑轨迹包 · ${editRoute}`}
        open={!!editRoute}
        onCancel={() => setEditRoute(null)}
        onOk={() => form.submit()}
        width={860}
        confirmLoading={saveBundle.isPending}
        destroyOnClose
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveBundle.mutate(v)}>
          <Form.Item name="official_id" label="官方轨迹 ID">
            <Input />
          </Form.Item>
          <Form.Item name="recommended_id" label="推荐轨迹 ID">
            <Input />
          </Form.Item>
          <Form.Item name="filter_tags" label="筛选标签（逗号分隔）">
            <Input />
          </Form.Item>
          <Form.List
            name="tracks"
            rules={[
              {
                validator: async (_, tracks) => {
                  if (!tracks || !tracks.length) throw new Error('至少一条轨迹');
                },
              },
            ]}
          >
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    style={{
                      border: '1px solid #E5DCCF',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Space wrap style={{ width: '100%' }}>
                      <Form.Item {...field} name={[field.name, 'id']} label="ID" rules={[{ required: true }]}>
                        <Input style={{ width: 160 }} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'title']}
                        label="标题"
                        rules={[{ required: true, message: '请填标题' }]}
                      >
                        <Input style={{ width: 200 }} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'author']} label="作者">
                        <Input style={{ width: 120 }} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'distance_km']} label="里程">
                        <InputNumber min={0} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'elevation_gain_m']} label="爬升">
                        <InputNumber min={0} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'rating']} label="评分">
                        <InputNumber min={0} max={5} step={0.1} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'is_official']} label="官方" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'recommended']} label="推荐" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Space>
                    <Form.Item {...field} name={[field.name, 'summary']} label="摘要">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'tags']} label="标签">
                      <Input placeholder="官方,标准" />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(field.name)}>
                      删除该轨迹
                    </Button>
                  </div>
                ))}
                <Button type="dashed" block onClick={() => add({ is_official: false, recommended: false })}>
                  添加轨迹
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="社区轨迹预览"
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={<Button onClick={() => setPreview(null)}>关闭</Button>}
        width={640}
      >
        {preview ? (
          <div style={{ lineHeight: 1.7 }}>
            <p>
              <Tag>{preview.route_id}</Tag>
              {preview.is_official ? <Tag color="green">官方</Tag> : null}
              {preview.recommended ? <Tag color="blue">推荐</Tag> : null}
              {preview.hidden ? <Tag>隐藏</Tag> : null}
            </p>
            <h3 style={{ marginTop: 0 }}>{(preview.payload?.title as string) || preview.id}</h3>
            <p style={{ color: '#8B7D6B' }}>{(preview.payload?.summary as string) || '无摘要'}</p>
            <pre
              style={{
                background: '#F7F2E9',
                padding: 12,
                borderRadius: 8,
                fontSize: 12,
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(preview.payload, null, 2)}
            </pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
