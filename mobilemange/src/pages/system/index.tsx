import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type LegalSection = { title: string; body: string };
type LegalDoc = {
  id: string;
  title: string;
  updated_at: string;
  sections: LegalSection[] | unknown;
};

type AuditLog = {
  id: string;
  actor_phone: string;
  action: string;
  resource: string;
  resource_id: string;
  detail: string;
  created_at: string;
};

type AuditPage = {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
};

function normalizeSections(raw: unknown): LegalSection[] {
  if (!Array.isArray(raw)) return [{ title: '', body: '' }];
  return raw.map((s) => {
    if (typeof s === 'string') return { title: '', body: s };
    const row = s as Record<string, unknown>;
    return {
      title: String(row.title || row.heading || ''),
      body: String(row.body || row.content || row.text || ''),
    };
  });
}

export default function SystemPage() {
  const qc = useQueryClient();
  const [legalEdit, setLegalEdit] = useState<LegalDoc | null>(null);
  const [campsText, setCampsText] = useState('[]');
  const [signalsText, setSignalsText] = useState('[]');
  const [legalForm] = Form.useForm();
  const [auditFilters, setAuditFilters] = useState({
    action: '',
    resource: '',
    actor: '',
    q: '',
    page: 1,
    limit: 50,
  });

  const legal = useQuery({
    queryKey: ['admin-legal'],
    queryFn: () => api<LegalDoc[]>('/api/v1/admin/legal-docs'),
  });
  const camps = useQuery({
    queryKey: ['admin-camps'],
    queryFn: () => api<unknown[]>('/api/v1/admin/camps'),
  });
  const signals = useQuery({
    queryKey: ['admin-signals'],
    queryFn: () => api<unknown[]>('/api/v1/admin/signals'),
  });
  const integrations = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: () => api<Record<string, unknown>>('/api/v1/admin/integrations/status'),
  });

  const auditQs = useMemo(() => {
    const p = new URLSearchParams();
    if (auditFilters.action) p.set('action', auditFilters.action);
    if (auditFilters.resource) p.set('resource', auditFilters.resource);
    if (auditFilters.actor) p.set('actor', auditFilters.actor);
    if (auditFilters.q) p.set('q', auditFilters.q);
    p.set('page', String(auditFilters.page));
    p.set('limit', String(auditFilters.limit));
    return p.toString();
  }, [auditFilters]);

  const audits = useQuery({
    queryKey: ['admin-audits', auditQs],
    queryFn: async () => {
      const data = await api<AuditPage | AuditLog[]>(`/api/v1/admin/audit-logs?${auditQs}`);
      if (Array.isArray(data)) {
        return { items: data, total: data.length, page: 1, limit: data.length } as AuditPage;
      }
      return data;
    },
  });

  const saveLegal = useMutation({
    mutationFn: async (values: { title: string; updated_at: string; sections: LegalSection[] }) => {
      const sections = (values.sections || [])
        .map((s) => ({ title: (s.title || '').trim(), body: (s.body || '').trim() }))
        .filter((s) => s.title || s.body);
      if (!sections.length) throw new Error('至少保留一个章节');
      return api(`/api/v1/admin/legal-docs/${legalEdit!.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: values.title,
          updated_at: values.updated_at,
          sections,
        }),
      });
    },
    onSuccess: () => {
      message.success('法律文案已保存');
      setLegalEdit(null);
      qc.invalidateQueries({ queryKey: ['admin-legal'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const saveCamps = useMutation({
    mutationFn: async () => {
      const body = JSON.parse(campsText);
      return api('/api/v1/admin/camps', { method: 'PUT', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      message.success('营地已保存');
      qc.invalidateQueries({ queryKey: ['admin-camps'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const saveSignals = useMutation({
    mutationFn: async () => {
      const body = JSON.parse(signalsText);
      return api('/api/v1/admin/signals', { method: 'PUT', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      message.success('信号点已保存');
      qc.invalidateQueries({ queryKey: ['admin-signals'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const exportAudits = () => {
    const rows = audits.data?.items || [];
    const header = ['时间', '操作人', '动作', '资源', '资源ID', '详情'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [r.created_at, r.actor_phone, r.action, r.resource, r.resource_id, `"${(r.detail || '').replace(/"/g, '""')}"`].join(
          ',',
        ),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-p${auditFilters.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title={routeMeta['/system'].title} description={routeMeta['/system'].desc} />
      <Panel>
        <Tabs
          items={[
            {
              key: 'legal',
              label: '法律文案',
              children: (
                <Table
                  rowKey="id"
                  loading={legal.isLoading}
                  dataSource={legal.data || []}
                  columns={[
                    { title: 'ID', dataIndex: 'id', width: 120 },
                    { title: '标题', dataIndex: 'title' },
                    { title: '更新', dataIndex: 'updated_at', width: 120 },
                    {
                      title: '操作',
                      width: 100,
                      render: (_, row) => (
                        <Button
                          type="link"
                          onClick={() => {
                            setLegalEdit(row);
                            legalForm.setFieldsValue({
                              title: row.title,
                              updated_at: row.updated_at,
                              sections: normalizeSections(row.sections),
                            });
                          }}
                        >
                          编辑
                        </Button>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'poi',
              label: '营地 / 信号点',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  <Card
                    title="营地 JSON（进阶）"
                    extra={
                      <Space>
                        <Button
                          size="small"
                          onClick={() => setCampsText(JSON.stringify(camps.data || [], null, 2))}
                        >
                          载入当前
                        </Button>
                        <Button
                          type="primary"
                          size="small"
                          loading={saveCamps.isPending}
                          onClick={() => saveCamps.mutate()}
                        >
                          保存
                        </Button>
                      </Space>
                    }
                  >
                    <Input.TextArea
                      rows={10}
                      value={campsText}
                      onChange={(e) => setCampsText(e.target.value)}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Card>
                  <Card
                    title="信号点 JSON（进阶）"
                    extra={
                      <Space>
                        <Button
                          size="small"
                          onClick={() => setSignalsText(JSON.stringify(signals.data || [], null, 2))}
                        >
                          载入当前
                        </Button>
                        <Button
                          type="primary"
                          size="small"
                          loading={saveSignals.isPending}
                          onClick={() => saveSignals.mutate()}
                        >
                          保存
                        </Button>
                      </Space>
                    }
                  >
                    <Input.TextArea
                      rows={10}
                      value={signalsText}
                      onChange={(e) => setSignalsText(e.target.value)}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Card>
                </Space>
              ),
            },
            {
              key: 'integrations',
              label: '集成状态',
              children: (
                <Card title="集成">
                  <pre style={{ margin: 0, fontSize: 13 }}>
                    {JSON.stringify(integrations.data || {}, null, 2)}
                  </pre>
                </Card>
              ),
            },
            {
              key: 'audit',
              label: '审计日志',
              children: (
                <>
                  <Form
                    layout="inline"
                    style={{ marginBottom: 12, rowGap: 8 }}
                    onFinish={(v) =>
                      setAuditFilters((prev) => ({
                        ...prev,
                        action: v.action || '',
                        resource: v.resource || '',
                        actor: v.actor || '',
                        q: v.q || '',
                        page: 1,
                      }))
                    }
                  >
                    <Form.Item name="action" label="动作">
                      <Input allowClear placeholder="如 resolve_sos" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name="resource" label="资源">
                      <Select
                        allowClear
                        style={{ width: 120 }}
                        options={[
                          { value: 'route', label: 'route' },
                          { value: 'post', label: 'post' },
                          { value: 'user', label: 'user' },
                          { value: 'guard', label: 'guard' },
                          { value: 'sos', label: 'sos' },
                          { value: 'trip', label: 'trip' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="actor" label="操作人">
                      <Input allowClear placeholder="手机号" style={{ width: 130 }} />
                    </Form.Item>
                    <Form.Item name="q" label="关键词">
                      <Input allowClear placeholder="详情/资源ID" style={{ width: 160 }} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">
                      筛选
                    </Button>
                    <Button onClick={exportAudits}>导出本页 CSV</Button>
                  </Form>
                  <Table
                    rowKey="id"
                    loading={audits.isLoading}
                    dataSource={audits.data?.items || []}
                    pagination={{
                      current: auditFilters.page,
                      pageSize: auditFilters.limit,
                      total: audits.data?.total || 0,
                      showSizeChanger: true,
                      onChange: (page, pageSize) =>
                        setAuditFilters((prev) => ({ ...prev, page, limit: pageSize || 50 })),
                    }}
                    columns={[
                      {
                        title: '时间',
                        dataIndex: 'created_at',
                        width: 180,
                        render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
                      },
                      { title: '操作人', dataIndex: 'actor_phone', width: 120 },
                      { title: '动作', dataIndex: 'action', width: 140 },
                      { title: '资源', dataIndex: 'resource', width: 90 },
                      { title: '资源ID', dataIndex: 'resource_id', width: 120 },
                      { title: '详情', dataIndex: 'detail', ellipsis: true },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      </Panel>

      <Modal
        title="编辑法律文案"
        open={!!legalEdit}
        onCancel={() => setLegalEdit(null)}
        onOk={() => legalForm.submit()}
        confirmLoading={saveLegal.isPending}
        width={720}
        destroyOnClose
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={legalForm} layout="vertical" onFinish={(v) => saveLegal.mutate(v)}>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="updated_at" label="更新日期">
            <Input placeholder="2026-08-30" />
          </Form.Item>
          <Form.List
            name="sections"
            rules={[
              {
                validator: async (_, sections) => {
                  if (!sections?.length) throw new Error('至少一节');
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
                      marginBottom: 10,
                    }}
                  >
                    <Form.Item
                      {...field}
                      name={[field.name, 'title']}
                      label="章节标题"
                      rules={[{ required: true, message: '请填标题' }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'body']}
                      label="正文"
                      rules={[{ required: true, message: '请填正文' }]}
                    >
                      <Input.TextArea rows={4} />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(field.name)}>
                      删除章节
                    </Button>
                  </div>
                ))}
                <Button type="dashed" block onClick={() => add({ title: '', body: '' })}>
                  添加章节
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
