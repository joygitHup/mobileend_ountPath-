import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type Item = {
  id: string;
  name: string;
  description?: string;
  category: 'essential' | 'recommended' | 'optional' | string;
  weight_grams?: number;
  checked?: boolean;
};

type Row = { id: string; payload: Item[] };

const catLabel: Record<string, string> = {
  essential: '建议必带',
  recommended: '推荐',
  optional: '可选',
};

const diffLabel: Record<string, string> = {
  easy: '简单',
  moderate: '中等',
  hard: '困难',
  expert: '专家',
  base: '基础',
};

export default function ChecklistsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const list = useQuery({
    queryKey: ['admin-checklists'],
    queryFn: () => api<Row[]>('/api/v1/admin/checklist-templates'),
  });

  const openEdit = (row?: Row) => {
    if (!row) {
      setEditId(null);
      form.setFieldsValue({
        id: 'moderate',
        items: [
          {
            id: `c_${Date.now()}`,
            name: '',
            category: 'essential',
            weight_grams: 100,
            description: '',
          },
        ],
      });
    } else {
      setEditId(row.id);
      const items = Array.isArray(row.payload) ? row.payload : [];
      form.setFieldsValue({ id: row.id, items });
    }
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async (values: { id?: string; items: Item[] }) => {
      const id = editId || values.id;
      if (!id) throw new Error('请选择难度 Key');
      const items = (values.items || []).map((it, i) => {
        if (!it.name?.trim()) throw new Error(`第 ${i + 1} 项缺少名称`);
        return {
          id: it.id || `c_${id}_${i + 1}`,
          name: it.name.trim(),
          description: it.description || '',
          category: it.category || 'recommended',
          weight_grams: Number(it.weight_grams) || 0,
          checked: false,
        };
      });
      if (!items.length) throw new Error('至少添加一件装备');
      return api(`/api/v1/admin/checklist-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(items),
      });
    },
    onSuccess: () => {
      message.success('模板已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-checklists'] });
    },
    onError: (e: Error) => message.error(e.message || '保存失败'),
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/checklists'].title}
        description="按难度配置清单条目（表单校验，不再裸贴 JSON）"
        extra={
          <Button type="primary" onClick={() => openEdit()}>
            新建/覆盖难度模板
          </Button>
        }
      />
      <Panel>
        <Table
          rowKey="id"
          loading={list.isLoading}
          dataSource={list.data || []}
          columns={[
            {
              title: '难度',
              dataIndex: 'id',
              render: (id: string) => (
                <Tag color="green">
                  {diffLabel[id] || id} ({id})
                </Tag>
              ),
            },
            {
              title: '条目数',
              width: 100,
              render: (_, row) => (Array.isArray(row.payload) ? row.payload.length : 0),
            },
            {
              title: '建议必带',
              width: 100,
              render: (_, row) =>
                Array.isArray(row.payload)
                  ? row.payload.filter((i) => i.category === 'essential').length
                  : 0,
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
      </Panel>
      <Modal
        title={editId ? `编辑模板 · ${diffLabel[editId] || editId}` : '新建/覆盖模板'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        width={820}
        confirmLoading={save.isPending}
        destroyOnClose
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          {!editId && (
            <Form.Item name="id" label="难度 Key" rules={[{ required: true }]} initialValue="moderate">
              <Select
                options={Object.entries(diffLabel).map(([value, label]) => ({
                  value,
                  label: `${label} (${value})`,
                }))}
              />
            </Form.Item>
          )}
          <Form.List
            name="items"
            rules={[
              {
                validator: async (_, items) => {
                  if (!items?.length) throw new Error('至少一件装备');
                },
              },
            ]}
          >
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field, idx) => (
                  <div
                    key={field.key}
                    style={{
                      border: '1px solid #E5DCCF',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Space wrap>
                      <Form.Item {...field} name={[field.name, 'id']} label="ID">
                        <Input style={{ width: 140 }} placeholder="自动可空" />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'name']}
                        label="名称"
                        rules={[{ required: true, message: '必填' }]}
                      >
                        <Input style={{ width: 160 }} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'category']}
                        label="分类"
                        rules={[{ required: true }]}
                        initialValue="essential"
                      >
                        <Select
                          style={{ width: 130 }}
                          options={Object.entries(catLabel).map(([value, label]) => ({ value, label }))}
                        />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'weight_grams']} label="克重">
                        <InputNumber min={0} />
                      </Form.Item>
                    </Space>
                    <Form.Item {...field} name={[field.name, 'description']} label="说明">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(field.name)}>
                      删除第 {idx + 1} 项
                    </Button>
                  </div>
                ))}
                <Button
                  type="dashed"
                  block
                  onClick={() =>
                    add({
                      id: `c_${Date.now()}`,
                      category: 'recommended',
                      weight_grams: 100,
                    })
                  }
                >
                  添加装备
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
