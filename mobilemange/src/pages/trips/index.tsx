import { Button, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type TripRow = {
  id: string;
  user_id: string;
  user_name: string;
  phone: string;
  route_id: string;
  route_name: string;
  status: string;
  departure_at: string;
  guard_session_id?: string | null;
  planned_duration_hours: number;
  updated_at: string;
};

const statusLabel: Record<string, string> = {
  planned: '计划中',
  active: '进行中',
  completed: '已完成',
};

export default function TripsPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || '');
  const [noteOpen, setNoteOpen] = useState<{ id: string; abandoned: boolean } | null>(null);
  const [note, setNote] = useState('');

  const list = useQuery({
    queryKey: ['admin-trips', status],
    queryFn: () =>
      api<TripRow[]>(
        `/api/v1/admin/trips${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    refetchInterval: 20_000,
  });

  const forceEnd = useMutation({
    mutationFn: ({ id, abandoned, note: n }: { id: string; abandoned: boolean; note: string }) =>
      api(`/api/v1/admin/trips/${id}/force-end`, {
        method: 'POST',
        body: JSON.stringify({ abandoned, note: n }),
      }),
    onSuccess: () => {
      message.success('行程已强制收口');
      setNoteOpen(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin-trips'] });
      qc.invalidateQueries({ queryKey: ['admin-guards'] });
      qc.invalidateQueries({ queryKey: ['admin-sos'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/trips'].title}
        description={routeMeta['/trips'].desc}
      />
      <Panel>
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            value={status}
            style={{ width: 160 }}
            onChange={setStatus}
            options={[
              { value: '', label: '全部状态' },
              { value: 'planned', label: '计划中' },
              { value: 'active', label: '进行中' },
            ]}
          />
          <Button onClick={() => list.refetch()}>刷新</Button>
        </Space>
        <Table
          rowKey="id"
          loading={list.isLoading}
          dataSource={list.data || []}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 1000 }}
          columns={[
            { title: '行程', dataIndex: 'id', width: 120 },
            {
              title: '用户',
              width: 140,
              render: (_, row) => (
                <div>
                  <div>{row.user_name}</div>
                  <div style={{ fontSize: 12, color: '#8B7D6B' }}>{row.phone}</div>
                </div>
              ),
            },
            { title: '路线', dataIndex: 'route_name', ellipsis: true },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: string) => (
                <Tag color={s === 'active' ? 'orange' : s === 'planned' ? 'blue' : 'default'}>
                  {statusLabel[s] || s}
                </Tag>
              ),
            },
            {
              title: '预计出发',
              dataIndex: 'departure_at',
              width: 170,
              render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
            },
            {
              title: '守护会话',
              dataIndex: 'guard_session_id',
              width: 120,
              render: (v: string | null) => v || '—',
            },
            {
              title: '操作',
              width: 200,
              fixed: 'right',
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => {
                      setNote('运营完结并计里程');
                      setNoteOpen({ id: row.id, abandoned: false });
                    }}
                  >
                    强制完结
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      setNote('运营取消行程不计里程');
                      setNoteOpen({ id: row.id, abandoned: true });
                    }}
                  >
                    强制取消
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        title={noteOpen?.abandoned ? '强制取消行程' : '强制完结行程'}
        open={!!noteOpen}
        onCancel={() => {
          setNoteOpen(null);
          setNote('');
        }}
        onOk={() => {
          if (!noteOpen) return;
          forceEnd.mutate({ id: noteOpen.id, abandoned: noteOpen.abandoned, note });
        }}
        confirmLoading={forceEnd.isPending}
        okText="确认"
        destroyOnClose
      >
        <p style={{ marginBottom: 8, color: '#8B7D6B' }}>
          将结束关联守护/SOS，并从当前行程表移除。取消不计里程；完结会按路线口径计入统计。
        </p>
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </div>
  );
}
