import { Button, Form, Input, Modal, Space, Table, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type Leader = {
  id: string;
  name?: string;
  avatar_url?: string;
  bio?: string;
  specialties?: string[];
  certifications?: string[];
};

export default function LeadersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Leader | null>(null);
  const [form] = Form.useForm();

  const list = useQuery({
    queryKey: ['admin-leaders'],
    queryFn: () => api<Leader[]>('/api/v1/admin/leaders'),
  });

  const save = useMutation({
    mutationFn: async (values: Leader & { specialties_str?: string; certs_str?: string }) => {
      const body = {
        ...editing,
        ...values,
        id: editing?.id || values.id,
        specialties: (values.specialties_str || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        certifications: (values.certs_str || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      };
      delete (body as { specialties_str?: string }).specialties_str;
      delete (body as { certs_str?: string }).certs_str;
      if (editing?.id) {
        return api(`/api/v1/admin/leaders/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      return api('/api/v1/admin/leaders', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-leaders'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/admin/leaders/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['admin-leaders'] });
    },
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/leaders'].title}
        description={routeMeta['/leaders'].desc}
        extra={
          <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
            新建领队
          </Button>
        }
      />
      <Panel>
      <Table
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data || []}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 80 },
          { title: '姓名', dataIndex: 'name' },
          { title: '简介', dataIndex: 'bio', ellipsis: true },
          {
            title: '专长',
            dataIndex: 'specialties',
            render: (v: string[]) => (v || []).join('、'),
          },
          {
            title: '操作',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button type="link" onClick={() => {
                  setEditing(row);
                  form.setFieldsValue({
                    ...row,
                    specialties_str: (row.specialties || []).join(','),
                    certs_str: (row.certifications || []).join(','),
                  });
                  setOpen(true);
                }}>编辑</Button>
                <Button type="link" danger onClick={() => remove.mutate(row.id)}>删除</Button>
              </Space>
            ),
          },
        ]}
      />
      </Panel>
      <Modal
        title={editing ? '编辑领队' : '新建领队'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          {!editing && <Form.Item name="id" label="ID（可空）"><Input /></Form.Item>}
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="avatar_url" label="头像 URL"><Input /></Form.Item>
          <Form.Item name="bio" label="简介"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="specialties_str" label="专长（逗号分隔）"><Input /></Form.Item>
          <Form.Item name="certs_str" label="资质（逗号分隔）"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
