import {
  Button, Card, Form, Input, Modal, Space, Table, Tabs, message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type LegalDoc = {
  id: string;
  title: string;
  updated_at: string;
  sections: unknown;
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

export default function SystemPage() {
  const qc = useQueryClient();
  const [legalEdit, setLegalEdit] = useState<LegalDoc | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [campsText, setCampsText] = useState('[]');
  const [signalsText, setSignalsText] = useState('[]');
  const [form] = Form.useForm();

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
  const audits = useQuery({
    queryKey: ['admin-audits'],
    queryFn: () => api<AuditLog[]>('/api/v1/admin/audit-logs'),
  });

  const saveLegal = useMutation({
    mutationFn: async (values: { title: string; updated_at: string }) => {
      const sections = JSON.parse(jsonText);
      return api(`/api/v1/admin/legal-docs/${legalEdit!.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...values, sections }),
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
                          form.setFieldsValue({ title: row.title, updated_at: row.updated_at });
                          setJsonText(JSON.stringify(row.sections, null, 2));
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
                  title="营地 JSON"
                  extra={
                    <Space>
                      <Button size="small" onClick={() => setCampsText(JSON.stringify(camps.data || [], null, 2))}>
                        载入当前
                      </Button>
                      <Button type="primary" size="small" loading={saveCamps.isPending} onClick={() => saveCamps.mutate()}>
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
                  title="信号点 JSON"
                  extra={
                    <Space>
                      <Button size="small" onClick={() => setSignalsText(JSON.stringify(signals.data || [], null, 2))}>
                        载入当前
                      </Button>
                      <Button type="primary" size="small" loading={saveSignals.isPending} onClick={() => saveSignals.mutate()}>
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
              <Card title="Integrations">
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
              <Table
                rowKey="id"
                loading={audits.isLoading}
                dataSource={audits.data || []}
                columns={[
                  { title: '时间', dataIndex: 'created_at', width: 190 },
                  { title: '操作人', dataIndex: 'actor_phone', width: 130 },
                  { title: '动作', dataIndex: 'action', width: 140 },
                  { title: '资源', dataIndex: 'resource', width: 100 },
                  { title: '资源ID', dataIndex: 'resource_id', width: 120 },
                  { title: '详情', dataIndex: 'detail', ellipsis: true },
                ]}
              />
            ),
          },
        ]}
      />
      </Panel>

      <Modal
        title="编辑法律文案"
        open={!!legalEdit}
        onCancel={() => setLegalEdit(null)}
        onOk={() => form.submit()}
        confirmLoading={saveLegal.isPending}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveLegal.mutate(v)}>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="updated_at" label="更新日期"><Input placeholder="2026-08-30" /></Form.Item>
          <Form.Item label="sections JSON">
            <Input.TextArea
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
