import { Alert, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { enqueueConfirm } from '@/utils/confirmQueue';

/** 轻提示（优先 Toast，避免 Web 上 Alert 无响应） */
export function notifyInfo(title: string, message?: string) {
  Toast.show({ type: 'info', text1: title, text2: message, visibilityTime: 2800 });
}

export function notifySuccess(title: string, message?: string) {
  Toast.show({ type: 'success', text1: title, text2: message, visibilityTime: 2600 });
}

export function notifyError(title: string, message?: string) {
  Toast.show({ type: 'error', text1: title, text2: message, visibilityTime: 3200 });
}

type ConfirmOpts = {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

/**
 * 确认框：原生用 Alert；Web 用自定义 Modal（保留「确定/取消」真实文案，支持嵌套队列）。
 */
export function confirmDialog(title: string, message: string, opts: ConfirmOpts) {
  const confirmText = opts.confirmText ?? '确定';
  const cancelText = opts.cancelText ?? '取消';

  if (Platform.OS === 'web') {
    void enqueueConfirm({
      title,
      message,
      confirmText,
      cancelText,
      destructive: opts.destructive,
    }).then((ok) => {
      if (ok) opts.onConfirm();
      else opts.onCancel?.();
    });
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel', onPress: opts.onCancel },
    {
      text: confirmText,
      style: opts.destructive ? 'destructive' : 'default',
      onPress: opts.onConfirm,
    },
  ]);
}
