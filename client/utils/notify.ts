import { Alert, Platform } from 'react-native';
import Toast from 'react-native-toast-message';

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
 * 确认框：原生多按钮 Alert 在 Web 常无响应，Web 改用 window.confirm。
 */
export function confirmDialog(title: string, message: string, opts: ConfirmOpts) {
  const confirmText = opts.confirmText ?? '确定';
  const cancelText = opts.cancelText ?? '取消';

  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined' &&
      window.confirm(`${title}\n\n${message}${opts.destructive ? `\n\n（${confirmText}）` : ''}`);
    if (ok) opts.onConfirm();
    else opts.onCancel?.();
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
