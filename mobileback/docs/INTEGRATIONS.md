# 真能力接入说明（天气 / 媒体 / 通知 / 地图 / 传感器）

本地默认即可跑通；生产按表替换 Provider。

| 能力 | 当前实现 | 生产替换 |
|------|----------|----------|
| 对象存储 | `data/uploads` + `POST /api/v1/media/upload` | 换 S3/OSS/COS，改 `internal/media` |
| 天气 | Open-Meteo（无需 Key） | 可换和风/彩云；`WEATHER_LAT/LNG` |
| GPS | Client `getBestPosition`（BestForNavigation） | 保持；守护/SOS 上报真坐标 |
| 离线地图 CDN | `GET /api/v1/maps/offline-packs` + `MAP_TILE_CDN` | 填真实瓦片 CDN（合规源） |
| SOS 短信/推送/卫星 | `internal/notify` Demo（打日志） | 实现 `Notifier`：Twilio/国内短信、APNs/FCM、北斗 SDK |
| 工具箱传感器 | `expo-sensors` 气压/磁力，无硬件则演示降级 | 真机即用 |
| 实名 | `POST /me/verify` 演示 | 对接持牌 KYC |
| 头像/发帖图 | 先 upload 再写 URL | 同上对象存储 |

## 环境变量（mobileback）

```bash
PUBLIC_BASE_URL=http://127.0.0.1:9092
UPLOAD_DIR=./data/uploads
WEATHER_LAT=30.25
WEATHER_LNG=118.15
MAP_TILE_CDN=https://tiles.example.com/mountpath
NOTIFY_MODE=demo   # 日后: twilio / aliyun_sms …
```

## 状态查询

`GET /api/v1/integrations/status`
