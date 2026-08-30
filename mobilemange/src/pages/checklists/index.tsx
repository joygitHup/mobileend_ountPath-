import { Button, Modal, Select, Table, message, Input } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type Row = { id: string; payload: unknown };

export default function ChecklistsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newId, setNewId] = useState('moderate');
  const [jsonText, setJsonText] = useState('');

  const list = useQuery({
    queryKey: ['admin-checklists'],
    queryFn: () => api<Row[]>('/api/v1/admin/checklist-templates'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const id = editId || newId;
      const payload = JSON.parse(jsonText);
      return api(`/api/v1/admin/checklist-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      message.success('模板已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-checklists'] });
    },
    onError: (e: Error) => message.error(e.message || 'JSON 无效'),
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/checklists'].title}
        description={routeMeta['/checklists'].desc}
        extra={
          <Button
            type="primary"
            onClick={() => {
              setEditId(null);
              setNewId('moderate');
              setJsonText(JSON.stringify([{ id: 'item1', name: '示例装备', checked: false }], null, 2));
              setOpen(true);
            }}
          >
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
          { title: '难度 Key', dataIndex: 'id' },
          {
            title: '操作',
            render: (_, row) => (
              <Button
                type="link"
                onClick={() => {
                  setEditId(row.id);
                  setJsonText(JSON.stringify(row.payload, null, 2));
                  setOpen(true);
                }}
              >
                编辑 JSON
              </Button>
            ),
          },
        ]}
      />
      </Panel>
      <Modal
        title={editId ? `编辑模板 · ${editId}` : '新建/覆盖模板'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => save.mutate()}
        width={720}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        {!editId && (
          <Select
            style={{ width: '100%', marginBottom: 12 }}
            value={newId}
            onChange={setNewId}
            options={['easy', 'moderate', 'hard', 'expert', 'base'].map((v) => ({ value: v, label: v }))}
          />
        )}
        <Input.TextArea
          rows={16}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>
    </div>
  );
}
