import { Button, Switch, Table, Tabs, message, Modal, Input } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type TrackBundle = { route_id: string; payload: unknown };
type PubTrack = {
  id: string;
  route_id: string;
  is_official: boolean;
  recommended: boolean;
  hidden: boolean;
  payload: unknown;
};

export default function TracksPage() {
  const qc = useQueryClient();
  const [editRoute, setEditRoute] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');

  const bundles = useQuery({
    queryKey: ['admin-tracks'],
    queryFn: () => api<TrackBundle[]>('/api/v1/admin/tracks'),
  });
  const published = useQuery({
    queryKey: ['admin-pub-tracks'],
    queryFn: () => api<PubTrack[]>('/api/v1/admin/published-tracks'),
  });

  const saveBundle = useMutation({
    mutationFn: async () => {
      if (!editRoute) return;
      const payload = JSON.parse(jsonText);
      return api(`/api/v1/admin/tracks/${editRoute}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      message.success('轨迹已保存');
      setEditRoute(null);
      qc.invalidateQueries({ queryKey: ['admin-tracks'] });
    },
    onError: (e: Error) => message.error(e.message || 'JSON 无效'),
  });

  const patchPub = useMutation({
    mutationFn: ({ id, ...body }: { id: string; is_official?: boolean; recommended?: boolean; hidden?: boolean }) =>
      api(`/api/v1/admin/published-tracks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      message.success('已更新');
      qc.invalidateQueries({ queryKey: ['admin-pub-tracks'] });
    },
  });

  return (
    <div>
      <PageHeader title={routeMeta['/tracks'].title} description={routeMeta['/tracks'].desc} />
      <Panel>
      <Tabs
        items={[
          {
            key: 'official',
            label: '路线轨迹包',
            children: (
              <Table
                rowKey="route_id"
                loading={bundles.isLoading}
                dataSource={bundles.data || []}
                columns={[
                  { title: '路线 ID', dataIndex: 'route_id' },
                  {
                    title: '操作',
                    render: (_, row) => (
                      <Button
                        type="link"
                        onClick={() => {
                          setEditRoute(row.route_id);
                          setJsonText(JSON.stringify(row.payload, null, 2));
                        }}
                      >
                        编辑 JSON
                      </Button>
                    ),
                  },
                ]}
              />
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
                  { title: 'ID', dataIndex: 'id', width: 120 },
                  { title: '路线', dataIndex: 'route_id', width: 100 },
                  {
                    title: '官方',
                    dataIndex: 'is_official',
                    render: (v: boolean, row) => (
                      <Switch checked={v} onChange={(c) => patchPub.mutate({ id: row.id, is_official: c })} />
                    ),
                  },
                  {
                    title: '推荐',
                    dataIndex: 'recommended',
                    render: (v: boolean, row) => (
                      <Switch checked={v} onChange={(c) => patchPub.mutate({ id: row.id, recommended: c })} />
                    ),
                  },
                  {
                    title: '隐藏',
                    dataIndex: 'hidden',
                    render: (v: boolean, row) => (
                      <Switch checked={v} onChange={(c) => patchPub.mutate({ id: row.id, hidden: c })} />
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
        title={`编辑轨迹 · ${editRoute}`}
        open={!!editRoute}
        onCancel={() => setEditRoute(null)}
        onOk={() => saveBundle.mutate()}
        width={720}
        confirmLoading={saveBundle.isPending}
      >
        <Input.TextArea rows={18} value={jsonText} onChange={(e) => setJsonText(e.target.value)} style={{ fontFamily: 'monospace' }} />
      </Modal>
    </div>
  );
}
