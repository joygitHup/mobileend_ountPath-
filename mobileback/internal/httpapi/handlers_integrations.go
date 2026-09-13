package httpapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"mountpath/mobileback/internal/db"
	"mountpath/mobileback/internal/notify"
)

func (s *Server) mediaUpload(c *gin.Context) {
	if s.Media == nil {
		c.JSON(503, gin.H{"error": "媒体存储未配置"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "请选择图片文件（字段名 file）"})
		return
	}
	if file.Size > 12<<20 {
		c.JSON(400, gin.H{"error": "图片请小于 12MB"})
		return
	}
	src, err := file.Open()
	if err != nil {
		c.JSON(400, gin.H{"error": "无法读取文件"})
		return
	}
	defer src.Close()
	ext := filepath.Ext(file.Filename)
	url, rel, err := s.Media.Save(src, ext)
	if err != nil {
		c.JSON(500, gin.H{"error": "上传失败"})
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"url": url, "path": rel}})
}

func (s *Server) mediaUploadBase64(c *gin.Context) {
	if s.Media == nil {
		c.JSON(503, gin.H{"error": "媒体存储未配置"})
		return
	}
	var body struct {
		Filename    string `json:"filename"`
		ContentType string `json:"content_type"`
		Data        string `json:"data"`
	}
	if err := c.BindJSON(&body); err != nil || strings.TrimSpace(body.Data) == "" {
		c.JSON(400, gin.H{"error": "缺少图片数据"})
		return
	}
	raw := body.Data
	if i := strings.Index(raw, ","); i >= 0 && strings.Contains(raw[:i], "base64") {
		raw = raw[i+1:]
	}
	decoded, err := decodeBase64(raw)
	if err != nil || len(decoded) == 0 {
		c.JSON(400, gin.H{"error": "图片解码失败"})
		return
	}
	if len(decoded) > 12<<20 {
		c.JSON(400, gin.H{"error": "图片请小于 12MB"})
		return
	}
	ext := filepath.Ext(body.Filename)
	if ext == "" {
		switch {
		case strings.Contains(body.ContentType, "png"):
			ext = ".png"
		case strings.Contains(body.ContentType, "webp"):
			ext = ".webp"
		default:
			ext = ".jpg"
		}
	}
	url, rel, err := s.Media.Save(bytes.NewReader(decoded), ext)
	if err != nil {
		c.JSON(500, gin.H{"error": "上传失败"})
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"url": url, "path": rel}})
}

func decodeBase64(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if b, err := base64.StdEncoding.DecodeString(raw); err == nil {
		return b, nil
	}
	return base64.RawStdEncoding.DecodeString(raw)
}

func (s *Server) mediaGet(c *gin.Context) {
	if s.Media == nil {
		c.Status(404)
		return
	}
	rel := strings.TrimPrefix(c.Param("filepath"), "/")
	abs, err := s.Media.AbsPath(rel)
	if err != nil {
		c.Status(400)
		return
	}
	c.File(abs)
}

func (s *Server) mapsOfflinePacks(c *gin.Context) {
	routeID := c.Query("route_id")
	configured := s.Cfg.MapTileCDN != ""
	base := s.Cfg.MapTileCDN
	if base == "" {
		base = strings.TrimRight(s.Cfg.PublicBaseURL, "/") + "/api/v1/media/maps"
	}
	packs := []gin.H{
		{
			"id": "pack_" + routeID + "_contour", "route_id": routeID, "layer": "contour",
			"title": "等高线离线包", "size_mb": 48, "cdn_url": base + "/" + routeID + "/contour.zip",
			"note": "配置 MAP_TILE_CDN 后指向真实瓦片 CDN；未配置时为占位地址",
			"downloadable": configured,
		},
		{
			"id": "pack_" + routeID + "_sat", "route_id": routeID, "layer": "satellite",
			"title": "卫星影像离线包", "size_mb": 120, "cdn_url": base + "/" + routeID + "/satellite.zip",
			"note": "生产环境对接 Mapbox/自建瓦片或国内测绘合规源",
			"downloadable": configured,
		},
	}
	c.JSON(200, gin.H{"data": gin.H{
		"route_id": routeID, "cdn_base": base, "packs": packs,
		"demo": !configured,
		"demo_note": "演示模式：可缓存路书与轨迹示意；瓦片需配置 MAP_TILE_CDN 后真下载",
		"gps_hint": "客户端请使用 Location.Accuracy.BestForNavigation，并开启后台定位权限",
	}})
}

func (s *Server) integrationsStatus(c *gin.Context) {
	c.JSON(200, gin.H{"data": gin.H{
		"weather":      "open-meteo",
		"media":        "local-disk",
		"notify":       s.Cfg.NotifyMode,
		"map_tile_cdn": s.Cfg.MapTileCDN != "",
		"sms":          "stub — set NOTIFY_MODE + vendor keys for production",
		"push":         "stub — wire APNs/FCM",
		"satellite":    "stub — wire Beidou/Iridium SDK",
		"kyc":          "demo verify endpoint only",
	}})
}

func locationJSONFresh(ts string, maxAge time.Duration) bool {
	if ts == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, ts)
	}
	if err != nil {
		return false
	}
	age := time.Since(t)
	return age >= 0 && age <= maxAge
}

func (s *Server) guardSosNotify(c *gin.Context) {
	var body struct {
		SessionID string  `json:"session_id"`
		Lat       float64 `json:"lat"`
		Lng       float64 `json:"lng"`
		Message   string  `json:"message"`
		Channel   string  `json:"channel"`
		Timestamp string  `json:"timestamp"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)

	var gs db.GuardSession
	q := s.DB.Where("user_id = ? AND status IN ?", uid, []string{"active", "sos"})
	if body.SessionID != "" {
		q = q.Where("id = ?", body.SessionID)
	}
	_ = q.First(&gs).Error

	lat, lng := body.Lat, body.Lng
	ts := strings.TrimSpace(body.Timestamp)
	fix := "gps"
	// 无当前点时，仅允许回退新鲜的上次位置，并保留原时间戳（禁止用 now 伪装）
	if lat == 0 && lng == 0 && gs.ID != "" {
		var loc map[string]any
		if json.Unmarshal([]byte(gs.LastLocationJSON), &loc) == nil {
			storedTS, _ := loc["timestamp"].(string)
			if locationJSONFresh(storedTS, 2*time.Minute) {
				if v, ok := loc["lat"].(float64); ok {
					lat = v
				}
				if v, ok := loc["lng"].(float64); ok {
					lng = v
				}
				if lat != 0 || lng != 0 {
					ts = storedTS
					fix = "last_known"
				}
			}
		}
	}
	if lat == 0 && lng == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法获取有效定位，请开启定位后重试，或直接拨打 110"})
		return
	}
	if fix != "last_known" && (ts == "" || !locationJSONFresh(ts, 5*time.Minute)) {
		ts = time.Now().Format(time.RFC3339)
	}

	if gs.ID != "" {
		gs.Status = "sos"
		loc := gin.H{"lat": lat, "lng": lng, "timestamp": ts, "fix": fix}
		gs.LastLocationJSON = mustJSON(loc)
		s.DB.Save(&gs)
	} else {
		s.DB.Model(&db.GuardSession{}).Where("user_id = ? AND status = ?", uid, "active").Update("status", "sos")
	}

	var user db.User
	_ = s.DB.First(&user, "id = ?", uid)
	var contacts []db.EmergencyContact
	s.DB.Where("user_id = ?", uid).Order("is_primary desc").Find(&contacts)
	ns := make([]notify.Contact, 0, len(contacts))
	notified := make([]gin.H, 0, len(contacts))
	for _, ct := range contacts {
		ns = append(ns, notify.Contact{Name: ct.Name, Phone: ct.Phone})
		notified = append(notified, gin.H{"name": ct.Name, "phone": ct.Phone})
	}
	if len(ns) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先在安全中心添加紧急联系人"})
		return
	}
	msg := body.Message
	if msg == "" {
		msg = "触发 SOS，请尽快联系并报警"
	}
	res := s.Notify.SendSOS(notify.SOSPayload{
		UserID: uid, UserName: user.Name, Phone: user.Phone, Contacts: ns,
		Lat: lat, Lng: lng, Message: msg, Channel: body.Channel,
		TrackURL: s.Cfg.PublicBaseURL + "/track?user=" + uid,
	})
	latest := gin.H{
		"id": "sos_" + uid + "_" + time.Now().Format("150405"),
		"status": "recorded", "notify": res,
		"contacts_notified": notified,
		"message": res.Message,
		"lat": lat, "lng": lng, "location_at": ts, "fix": fix,
		"at": res.At, "mode": res.Mode,
	}
	s.persistLatestSos(uid, latest)
	c.JSON(http.StatusOK, gin.H{"data": latest})
}

func (s *Server) meSosNotify(c *gin.Context) {
	var body struct {
		Lat       float64 `json:"lat"`
		Lng       float64 `json:"lng"`
		Message   string  `json:"message"`
		Channel   string  `json:"channel"`
		Timestamp string  `json:"timestamp"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	var user db.User
	_ = s.DB.First(&user, "id = ?", uid)
	var contacts []db.EmergencyContact
	s.DB.Where("user_id = ?", uid).Find(&contacts)
	ns := make([]notify.Contact, 0, len(contacts))
	notified := make([]gin.H, 0, len(contacts))
	for _, ct := range contacts {
		ns = append(ns, notify.Contact{Name: ct.Name, Phone: ct.Phone})
		notified = append(notified, gin.H{"name": ct.Name, "phone": ct.Phone})
	}
	if len(ns) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先添加紧急联系人"})
		return
	}
	lat, lng := body.Lat, body.Lng
	if lat == 0 && lng == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法获取定位，请开启定位权限后重试，或直接拨打 110"})
		return
	}
	ts := strings.TrimSpace(body.Timestamp)
	if ts == "" || !locationJSONFresh(ts, 5*time.Minute) {
		ts = time.Now().Format(time.RFC3339)
	}
	msg := body.Message
	if msg == "" {
		msg = "安全中心一键求救"
	}
	res := s.Notify.SendSOS(notify.SOSPayload{
		UserID: uid, UserName: user.Name, Phone: user.Phone, Contacts: ns,
		Lat: lat, Lng: lng, Message: msg,
		Channel: body.Channel, TrackURL: s.Cfg.PublicBaseURL + "/safety",
	})
	guardOut := s.ensureSosGuardSession(uid, lat, lng, ts)
	latest := gin.H{
		"id": "sos_" + uid + "_" + time.Now().Format("150405"),
		"status": "recorded", "notify": res,
		"contacts_notified": notified,
		"message": res.Message,
		"lat": lat, "lng": lng, "location_at": ts, "fix": "gps",
		"at": res.At, "mode": res.Mode,
		"guard_session": guardOut,
	}
	s.persistLatestSos(uid, latest)
	c.JSON(200, gin.H{"data": latest})
}

/** 有进行中会话则升为 sos 并写点；否则新建 sos 会话（可挂当前行程） */
func (s *Server) ensureSosGuardSession(uid string, lat, lng float64, ts string) gin.H {
	loc := gin.H{"lat": lat, "lng": lng, "timestamp": ts, "fix": "gps"}
	var gs db.GuardSession
	if err := s.DB.Where("user_id = ? AND status IN ?", uid, []string{"active", "sos"}).First(&gs).Error; err == nil {
		gs.Status = "sos"
		gs.LastLocationJSON = mustJSON(loc)
		s.DB.Save(&gs)
		return gin.H{
			"id": gs.ID, "status": "sos",
			"started_at":              gs.StartedAt.Format(time.RFC3339),
			"planned_duration_hours": gs.PlannedDurationHours,
			"route_id":               gs.RouteID,
		}
	}
	guardians := s.contactGuardianNames(uid)
	hours := 8
	routeID := ""
	var tripID *string
	if cur := s.currentTrip(uid); cur != nil {
		routeID = cur.RouteID
		id := cur.ID
		tripID = &id
		if cur.PlannedDurationHours > 0 {
			hours = cur.PlannedDurationHours
		}
	}
	gs = db.GuardSession{
		ID: "guard_" + uuid.NewString()[:10], UserID: uid, RouteID: routeID, TripID: tripID,
		Status: "sos", StartedAt: time.Now(), PlannedDurationHours: hours,
		GuardiansJSON: mustJSON(guardians), LastLocationJSON: mustJSON(loc),
	}
	s.DB.Create(&gs)
	if tripID != nil {
		s.DB.Model(&db.Trip{}).Where("id = ?", *tripID).Updates(map[string]any{
			"guard_session_id": gs.ID, "status": "active",
		})
	}
	return gin.H{
		"id": gs.ID, "status": "sos",
		"started_at":              gs.StartedAt.Format(time.RFC3339),
		"planned_duration_hours": hours,
		"route_id":               routeID,
	}
}

func (s *Server) resolveLatestSos(uid, reason string) {
	var st db.SafetySettings
	if err := s.DB.First(&st, "user_id = ?", uid).Error; err != nil || st.LastSosJSON == "" {
		return
	}
	var latest map[string]any
	if err := json.Unmarshal([]byte(st.LastSosJSON), &latest); err != nil || latest == nil {
		latest = map[string]any{}
	}
	latest["status"] = "resolved"
	latest["resolved_at"] = time.Now().Format(time.RFC3339)
	latest["resolve_reason"] = reason
	st.LastSosJSON = mustJSON(latest)
	s.DB.Save(&st)
}

func (s *Server) persistLatestSos(uid string, latest gin.H) {
	st := s.ensureSafetySettings(uid)
	st.LastSosJSON = mustJSON(latest)
	s.DB.Save(&st)
}
