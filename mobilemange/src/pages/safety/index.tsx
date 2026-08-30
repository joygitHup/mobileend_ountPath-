import { Button, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type GuardSession = {
  id: string;
  user_id: string;
  route_id: string;
  status: string;
  started_at: string;
  planned_duration_hours: number;
  last_location: unknown;
  overtime_notified_at?: string;
};

type SosRow = {
  user_id: string;
  user_name: string;
  phone: string;
  sos: unknown;
};

export default function SafetyPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('active');

  const sessions = useQuery({
    queryKey: ['admin-guards', status],
    queryFn: () =>
      api<GuardSession[]>(`/api/v1/admin/guard/sessions${status ? `?status=${status}` : ''}`),
  });
  const sos = useQuery({
    queryKey: ['admin-sos'],
    queryFn: () => api<SosRow[]>('/api/v1/admin/sos'),
  });

  const patch = useMutation({
    mutationFn: ({ id, status: st }: { id: string; status: string }) =>
      api(`/api/v1/admin/guard/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: st, note: 'ops action' }),
      }),
    onSuccess: () => {
      message.success('会话状态已更新');
      qc.invalidateQueries({ queryKey: ['admin-guards'] });
    },
  });

  return (
    <div>
      <PageHeader title={routeMeta['/safety'].title} description={routeMeta['/safety'].desc} />
      <Panel>
      <Tabs
        items={[
          {
            key: 'guard',
            label: '守护会话',
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Select
                    value={status}
                    style={{ width: 160 }}
                    onChange={setStatus}
                    options={[
                      { value: 'active', label: '进行中' },
                      { value: 'stopped', label: '已结束' },
                      { value: '', label: '全部' },
                    ]}
                  />
                </Space>
                <Table
                  rowKey="id"
                  loading={sessions.isLoading}
                  dataSource={sessions.data || []}
                  columns={[
                    { title: '会话', dataIndex: 'id', width: 120 },
                    { title: '用户', dataIndex: 'user_id', width: 100 },
                    { title: '路线', dataIndex: 'route_id', width: 90 },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      width: 100,
                      render: (s: string) => (
                        <Tag color={s === 'active' ? 'red' : 'default'}>{s}</Tag>
                      ),
                    },
                    { title: '开始时间', dataIndex: 'started_at', width: 180 },
                    { title: '计划(h)', dataIndex: 'planned_duration_hours', width: 90 },
                    {
                      title: '操作',
                      width: 140,
                      render: (_, row) =>
                        row.status === 'active' ? (
                          <Button
                            danger
                            size="small"
                            onClick={() => patch.mutate({ id: row.id, status: 'stopped' })}
                          >
                            强制结束
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'sos',
            label: 'SOS 记录',
            children: (
              <Table
                rowKey="user_id"
                loading={sos.isLoading}
                dataSource={sos.data || []}
                columns={[
                  { title: '用户', dataIndex: 'user_name' },
                  { title: '手机', dataIndex: 'phone' },
                  {
                    title: 'SOS 摘要',
                    dataIndex: 'sos',
                    render: (v: unknown) => (
                      <pre style={{ margin: 0, fontSize: 12, maxWidth: 480, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(v, null, 2)}
                      </pre>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
      </Panel>
    </div>
  );
}
