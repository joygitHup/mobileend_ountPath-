import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web 根 HTML：移动端 viewport + 刘海安全区，滚动交由 RN ScrollView 处理。
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#2D6A4F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                overscroll-behavior: none;
                -webkit-tap-highlight-color: transparent;
                -webkit-text-size-adjust: 100%;
              }
              body {
                background-color: #E8DFD3;
              }
              input, textarea, select, button {
                font-size: 16px;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
