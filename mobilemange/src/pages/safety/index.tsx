import {
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type Loc = { lat?: number; lng?: number; timestamp?: string; fix?: string };

type GuardSession = {
  id: string;
  user_id: string;
  user_name?: string;
  phone?: string;
  route_id: string;
  route_name?: string;
  trip_id?: string | null;
  status: string;
  started_at: string;
  planned_duration_hours: number;
  last_location: Loc | null;
  guardians?: string[] | unknown;
  overtime?: boolean;
  overtime_notified_at?: string;
};

type SosPayload = {
  status?: string;
  message?: string;
  at?: string;
  lat?: number;
  lng?: number;
  location_at?: string;
  contacts_notified?: { name: string; phone: string }[];
};

type SosRow = {
  user_id: string;
  user_name: string;
  phone: string;
  status: string;
  sos: SosPayload;
};

const statusLabel: Record<string, string> = {
  active: '守护中',
  sos: 'SOS',
  completed: '已结束',
  recorded: '待处置',
  resolved: '已结案',
};

function locText(loc: Loc | null | undefined) {
  if (!loc || (loc.lat == null && loc.lng == null)) return '—';
  const coords = `${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}`;
  const ts = loc.timestamp ? ` · ${new Date(loc.timestamp).toLocaleString()}` : '';
  return coords + ts;
}

export default function SafetyPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const initialTab = params.get('tab') === 'sos' ? 'sos' : 'guard';
  const [tab, setTab] = useState(initialTab);
  const [status, setStatus] = useState(params.get('status') || 'open');
  const [noteOpen, setNoteOpen] = useState<{ id: string; kind: 'guard' | 'sos'; userId?: string } | null>(
    null,
  );
  const [note, setNote] = useState('');

  const sessions = useQuery({
    queryKey: ['admin-guards', status],
    queryFn: () =>
      api<GuardSession[]>(
        `/api/v1/admin/guard/sessions${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    refetchInterval: 15_000,
  });
  const sos = useQuery({
    queryKey: ['admin-sos'],
    queryFn: () => api<SosRow[]>('/api/v1/admin/sos'),
    refetchInterval: 15_000,
  });

  const patchGuard = useMutation({
    mutationFn: ({ id, note: n }: { id: string; note: string }) =>
      api(`/api/v1/admin/guard/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', note: n || '运营强制结束' }),
      }),
    onSuccess: () => {
      message.success('已强制结束守护');
      setNoteOpen(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin-guards'] });
      qc.invalidateQueries({ queryKey: ['admin-sos'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const resolveSos = useMutation({
    mutationFn: ({ userId, note: n }: { userId: string; note: string }) =>
      api(`/api/v1/admin/sos/${userId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ note: n || '运营确认安全并结案' }),
      }),
    onSuccess: () => {
      message.success('SOS 已结案');
      setNoteOpen(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin-sos'] });
      qc.invalidateQueries({ queryKey: ['admin-guards'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openCount = useMemo(
    () => (sos.data || []).filter((r) => r.status !== 'resolved' && r.status !== 'closed').length,
    [sos.data],
  );

  return (
    <div>
      <PageHeader
        title={routeMeta['/safety'].title}
        description={`${routeMeta['/safety'].desc} · 每 15 秒自动刷新`}
      />
      <Panel>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'guard',
              label: `守护会话 (${sessions.data?.length ?? 0})`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Select
                      value={status}
                      style={{ width: 160 }}
                      onChange={setStatus}
                      options={[
                        { value: 'open', label: '进行中(含SOS)' },
                        { value: 'active', label: '仅守护中' },
                        { value: 'sos', label: '仅 SOS' },
                        { value: 'completed', label: '已结束' },
                        { value: '', label: '全部' },
                      ]}
                    />
                    <Button onClick={() => sessions.refetch()}>立即刷新</Button>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={sessions.isLoading}
                    dataSource={sessions.data || []}
                    scroll={{ x: 1100 }}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      {
                        title: '用户',
                        width: 140,
                        render: (_, row) => (
                          <div>
                            <div>{row.user_name || row.user_id}</div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {row.phone || row.user_id}
                            </Typography.Text>
                          </div>
                        ),
                      },
                      {
                        title: '路线',
                        width: 140,
                        render: (_, row) => row.route_name || row.route_id || '—',
                      },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        width: 100,
                        render: (s: string, row) => (
                          <Space direction="vertical" size={0}>
                            <Tag color={s === 'sos' ? 'red' : s === 'active' ? 'orange' : 'default'}>
                              {statusLabel[s] || s}
                            </Tag>
                            {row.overtime ? <Tag color="magenta">超时</Tag> : null}
                          </Space>
                        ),
                      },
                      {
                        title: '最近位置',
                        width: 220,
                        render: (_, row) => (
                          <Typography.Text style={{ fontSize: 12 }}>
                            {locText(row.last_location)}
                          </Typography.Text>
                        ),
                      },
                      {
                        title: '开始',
                        dataIndex: 'started_at',
                        width: 170,
                        render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
                      },
                      {
                        title: '计划(h)',
                        dataIndex: 'planned_duration_hours',
                        width: 80,
                      },
                      {
                        title: '操作',
                        width: 120,
                        fixed: 'right',
                        render: (_, row) =>
                          row.status === 'active' || row.status === 'sos' ? (
                            <Button
                              danger
                              size="small"
                              onClick={() => {
                                setNote('运营强制结束守护');
                                setNoteOpen({ id: row.id, kind: 'guard' });
                              }}
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
              label: `SOS 待处置 (${openCount})`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button onClick={() => sos.refetch()}>立即刷新</Button>
                    <Typography.Text type="secondary">默认仅展示未结案记录</Typography.Text>
                  </Space>
                  <Table
                    rowKey="user_id"
                    loading={sos.isLoading}
                    dataSource={sos.data || []}
                    scroll={{ x: 960 }}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      { title: '用户', dataIndex: 'user_name', width: 120 },
                      { title: '手机', dataIndex: 'phone', width: 130 },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        width: 100,
                        render: (s: string) => (
                          <Tag color={s === 'resolved' ? 'green' : 'red'}>
                            {statusLabel[s] || s}
                          </Tag>
                        ),
                      },
                      {
                        title: '摘要',
                        render: (_, row) => {
                          const s = row.sos || {};
                          const contacts = (s.contacts_notified || [])
                            .map((c) => c.name)
                            .join('、');
                          return (
                            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                              <div>{s.message || '—'}</div>
                              <div>
                                坐标：
                                {s.lat != null && s.lng != null
                                  ? `${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)}`
                                  : '—'}
                              </div>
                              <div>时间：{s.at || s.location_at || '—'}</div>
                              <div>通知：{contacts || '—'}</div>
                            </div>
                          );
                        },
                      },
                      {
                        title: '操作',
                        width: 140,
                        fixed: 'right',
                        render: (_, row) =>
                          row.status !== 'resolved' && row.status !== 'closed' ? (
                            <Button
                              type="primary"
                              size="small"
                              onClick={() => {
                                setNote('运营确认安全并结案');
                                setNoteOpen({ id: row.user_id, kind: 'sos', userId: row.user_id });
                              }}
                            >
                              确认安全结案
                            </Button>
                          ) : (
                            <Tag color="green">已结案</Tag>
                          ),
                      },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      </Panel>

      <Modal
        title={noteOpen?.kind === 'sos' ? 'SOS 结案备注' : '强制结束备注'}
        open={!!noteOpen}
        onCancel={() => {
          setNoteOpen(null);
          setNote('');
        }}
        onOk={() => {
          if (!noteOpen) return;
          if (noteOpen.kind === 'guard') {
            patchGuard.mutate({ id: noteOpen.id, note });
          } else {
            resolveSos.mutate({ userId: noteOpen.userId || noteOpen.id, note });
          }
        }}
        confirmLoading={patchGuard.isPending || resolveSos.isPending}
        okText="确认"
        destroyOnClose
      >
        <Input.TextArea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="写入审计日志的处置说明"
        />
      </Modal>
    </div>
  );
}
