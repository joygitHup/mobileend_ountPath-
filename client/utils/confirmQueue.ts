/** Web 端多按钮确认队列（替代 window.confirm，保留自定义文案） */

export type ConfirmRequest = {
  id: number;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
  resolve: (confirmed: boolean) => void;
};

let seq = 0;
const queue: ConfirmRequest[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeConfirmQueue(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveConfirm(): ConfirmRequest | null {
  return queue[0] ?? null;
}

export function enqueueConfirm(input: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({
      id: ++seq,
      title: input.title,
      message: input.message,
      confirmText: input.confirmText ?? '确定',
      cancelText: input.cancelText ?? '取消',
      destructive: input.destructive,
      resolve,
    });
    emit();
  });
}

export function answerConfirm(confirmed: boolean) {
  const req = queue.shift();
  emit();
  req?.resolve(confirmed);
}
