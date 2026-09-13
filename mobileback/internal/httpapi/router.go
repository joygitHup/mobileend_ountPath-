package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mountpath/mobileback/internal/auth"
	"mountpath/mobileback/internal/config"
	"mountpath/mobileback/internal/db"
	"mountpath/mobileback/internal/domain"
	"mountpath/mobileback/internal/media"
	"mountpath/mobileback/internal/notify"
	"mountpath/mobileback/internal/weather"
)

type Server struct {
	DB      *gorm.DB
	Cfg     config.Config
	Weather *weather.Client
	Media   *media.Store
	Notify  notify.Notifier
}

func NewRouter(gdb *gorm.DB, cfg config.Config) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), gin.Logger(), corsMiddleware())

	store, err := media.New(cfg.UploadDir, cfg.PublicBaseURL)
	if err != nil {
		panic(err)
	}
	s := &Server{
		DB: gdb, Cfg: cfg,
		Weather: weather.New(cfg.WeatherLat, cfg.WeatherLng),
		Media:   store,
		Notify:  notify.New(cfg.NotifyMode),
	}

	r.GET("/api/v1/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "mobileback"})
	})

	api := r.Group("/api/v1")
	{
		api.POST("/auth/login", s.login)
        println("✅ 路由注册: /api/v1/auth/login")
		api.GET("/routes/discover", s.routesDiscover)
		api.GET("/routes/search", s.routesSearch)
		api.GET("/routes", s.routesList)
		api.GET("/routes/:id", s.routeDetail)

		api.GET("/tools", s.toolsList)
		api.GET("/tools/signal", s.toolsSignal)
		api.GET("/tools/camps", s.toolsCamps)

		api.GET("/checklist/:routeId", s.checklistGet)
		api.POST("/checklist/:routeId/toggle", s.authOptional(), s.checklistToggle)

		trips := api.Group("/trips")
		{
			trips.GET("/board", s.authRequired(), s.tripsBoard)
			trips.GET("/current", s.authRequired(), s.tripsCurrent)
			trips.GET("/favorites", s.authRequired(), s.favoritesList)
			trips.POST("/favorites/toggle", s.authRequired(), s.favoritesToggle)
			trips.GET("/favorites/:routeId", s.authRequired(), s.favoriteGet)
			trips.POST("", s.authRequired(), s.tripsCreate)
			trips.GET("/by-route/:routeId", s.authRequired(), s.tripsByRoute)
			trips.POST("/:id/checklist", s.authRequired(), s.tripsChecklist)
			trips.POST("/:id/disclaimer", s.authRequired(), s.tripsDisclaimer)
			trips.GET("/:id/track-access", s.authRequired(), s.tripsTrackAccess)
			trips.POST("/:id/complete", s.authRequired(), s.tripsComplete)
			trips.DELETE("/:id", s.authRequired(), s.tripsDelete)
			trips.GET("/:id", s.authRequired(), s.tripsGet)
		}

		me := api.Group("/me", s.authRequired())
		{
			me.GET("/profile", s.meProfile)
			me.PATCH("/profile", s.mePatchProfile)
			me.POST("/verify", s.meVerify)
			me.GET("/safety", s.meSafety)
			me.GET("/contacts", s.meContacts)
			me.POST("/contacts", s.meAddContact)
			me.DELETE("/contacts/:id", s.meDelContact)
			me.POST("/contacts/:id/primary", s.mePrimaryContact)
			me.PATCH("/safety/settings", s.meSafetySettings)
			me.POST("/satellite/bind", s.meSatBind)
			me.POST("/satellite/unbind", s.meSatUnbind)
			me.POST("/sos", s.meSosNotify)
			me.GET("/notifications", s.meNotifications)
			me.GET("/notifications/unread-count", s.meNotificationsUnread)
			me.POST("/notifications/read-all", s.meNotificationsReadAll)
			me.POST("/notifications/:id/read", s.meNotificationRead)
			me.GET("/community/new-count", s.meCommunityNewCount)
			me.POST("/community/seen", s.meCommunitySeen)
		}

		api.POST("/media/upload", s.authRequired(), s.mediaUpload)
		api.POST("/media/upload-base64", s.authRequired(), s.mediaUploadBase64)
		api.GET("/media/*filepath", s.mediaGet)
		api.GET("/maps/offline-packs", s.mapsOfflinePacks)
		api.GET("/integrations/status", s.integrationsStatus)

		api.GET("/community/board", s.communityBoard)
		api.GET("/community/search", s.communitySearch)
		api.GET("/community/posts", s.communityPosts)
		api.POST("/community/posts", s.authRequired(), s.communityCreatePost)
		api.GET("/community/posts/:id", s.communityPostDetail)
		api.GET("/community/posts/:id/comments", s.communityComments)
		api.POST("/community/posts/:id/comments", s.authRequired(), s.communityAddComment)
		api.POST("/community/posts/:id/like", s.authRequired(), s.communityTogglePostLike)
		api.POST("/community/posts/:id/join", s.authRequired(), s.communityCompanionJoin)
		api.POST("/community/posts/:id/answered", s.authRequired(), s.communityMarkAnswered)
		api.POST("/community/comments/:id/like", s.authRequired(), s.communityToggleCommentLike)
		api.GET("/community/leaders", s.communityLeaders)

		guard := api.Group("/guard", s.authRequired())
		{
			guard.POST("/start", s.guardStart)
			guard.POST("/sos", s.guardSosNotify)
			guard.POST("/stop", s.guardStop)
			guard.POST("/checkin", s.guardCheckin)
			guard.POST("/overtime", s.guardOvertime)
			guard.GET("/status", s.guardStatus)
		}

		track := api.Group("/track")
		{
			track.GET("/list/:routeId", s.trackList)
			track.POST("/start", s.authRequired(), s.trackStart)
			track.POST("/progress", s.authRequired(), s.trackProgress)
			track.POST("/end", s.authRequired(), s.trackEnd)
			track.POST("/annotations", s.authRequired(), s.trackAnnotate)
			track.POST("/publish", s.authRequired(), s.trackPublish)
			track.POST("/feedback", s.trackFeedback)
			track.DELETE("/annotations/:id", s.authRequired(), s.trackDelAnnotation)
			track.GET("/:routeId", s.trackGet)
		}

		admin := api.Group("/admin", s.adminRequired())
		{
			admin.GET("/me", s.adminMe)
			admin.GET("/dashboard/summary", s.adminDashboardSummary)
			admin.GET("/dashboard/insights", s.adminDashboardInsights)

			admin.GET("/routes", s.adminRoutesList)
			admin.GET("/routes/:id", s.adminRouteGet)
			admin.POST("/routes", s.adminRouteCreate)
			admin.PATCH("/routes/:id", s.adminRoutePatch)
			admin.DELETE("/routes/:id", s.adminRouteDelete)

			admin.GET("/tracks", s.adminTracksList)
			admin.GET("/tracks/:routeId", s.adminTrackGet)
			admin.PUT("/tracks/:routeId", s.adminTrackPut)
			admin.GET("/published-tracks", s.adminPublishedTracksList)
			admin.PATCH("/published-tracks/:id", s.adminPublishedTrackPatch)

			admin.GET("/checklist-templates", s.adminChecklistList)
			admin.GET("/checklist-templates/:id", s.adminChecklistGet)
			admin.PUT("/checklist-templates/:id", s.adminChecklistPut)

			admin.GET("/leaders", s.adminLeadersList)
			admin.POST("/leaders", s.adminLeaderCreate)
			admin.PATCH("/leaders/:id", s.adminLeaderPatch)
			admin.DELETE("/leaders/:id", s.adminLeaderDelete)

			admin.GET("/tools", s.adminToolsList)
			admin.POST("/tools", s.adminToolCreate)
			admin.PATCH("/tools/:id", s.adminToolPatch)
			admin.DELETE("/tools/:id", s.adminToolDelete)

			admin.GET("/posts", s.adminPostsList)
			admin.PATCH("/posts/:id", s.adminPostPatch)
			admin.DELETE("/posts/:id", s.adminPostDelete)
			admin.GET("/comments", s.adminCommentsList)
			admin.DELETE("/comments/:id", s.adminCommentDelete)

			admin.GET("/users", s.adminUsersList)
			admin.PATCH("/users/:id", s.adminUserPatch)

			admin.GET("/guard/sessions", s.adminGuardSessions)
			admin.PATCH("/guard/sessions/:id", s.adminGuardSessionPatch)
			admin.GET("/sos", s.adminSosList)
			admin.POST("/sos/:userId/resolve", s.adminSosResolve)

			admin.GET("/trips", s.adminTripsList)
			admin.POST("/trips/:id/force-end", s.adminTripForceEnd)
			admin.GET("/companion-interests", s.adminCompanionInterests)

			admin.GET("/legal-docs", s.adminLegalList)
			admin.PUT("/legal-docs/:id", s.adminLegalPut)

			admin.GET("/camps", s.adminCampsList)
			admin.PUT("/camps", s.adminCampsPut)
			admin.GET("/signals", s.adminSignalsList)
			admin.PUT("/signals", s.adminSignalsPut)

			admin.GET("/integrations/status", s.integrationsStatus)
			admin.GET("/audit-logs", s.adminAuditList)

			admin.POST("/media/upload", s.mediaUpload)
		}
	}

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func (s *Server) authRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := s.claimsFromHeader(c)
		if claims == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录或登录已失效"})
			return
		}
		c.Set("userID", claims.UserID)
		c.Set("role", claims.Role)
		c.Set("phone", claims.Phone)
		c.Next()
	}
}

func (s *Server) authOptional() gin.HandlerFunc {
	return func(c *gin.Context) {
		if claims := s.claimsFromHeader(c); claims != nil {
			c.Set("userID", claims.UserID)
			c.Set("role", claims.Role)
			c.Set("phone", claims.Phone)
		}
		c.Next()
	}
}

func (s *Server) adminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := s.claimsFromHeader(c)
		if claims == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录或登录已失效"})
			return
		}
		var user db.User
		if err := s.DB.First(&user, "id = ?", claims.UserID).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
			return
		}
		role := user.Role
		if role == "" {
			role = auth.RoleUser
		}
		if user.Banned {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "账号已封禁"})
			return
		}
		if !auth.IsStaff(role) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "需要运营或管理员权限"})
			return
		}
		c.Set("userID", user.ID)
		c.Set("role", role)
		c.Set("phone", user.Phone)
		c.Next()
	}
}

func (s *Server) claimsFromHeader(c *gin.Context) *auth.Claims {
	h := c.GetHeader("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return nil
	}
	claims, err := auth.Parse(s.Cfg.JWTSecret, strings.TrimPrefix(h, "Bearer "))
	if err != nil {
		return nil
	}
	return claims
}

func (s *Server) userIDFromHeader(c *gin.Context) string {
	claims := s.claimsFromHeader(c)
	if claims == nil {
		return ""
	}
	return claims.UserID
}

func (s *Server) uid(c *gin.Context) string {
	v, _ := c.Get("userID")
	if id, ok := v.(string); ok {
		return id
	}
	return ""
}

func (s *Server) role(c *gin.Context) string {
	v, _ := c.Get("role")
	if r, ok := v.(string); ok {
		return r
	}
	return auth.RoleUser
}

func (s *Server) login(c *gin.Context) {
	var body struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	phone := strings.TrimSpace(body.Phone)
	if len(phone) < 11 {
		c.JSON(400, gin.H{"error": "请输入正确的手机号"})
		return
	}
	if strings.TrimSpace(body.Code) != s.Cfg.DemoOTP {
		c.JSON(400, gin.H{"error": "验证码错误（演示环境请使用 " + s.Cfg.DemoOTP + "）"})
		return
	}
	var user db.User
	err := s.DB.Where("phone = ?", phone).First(&user).Error
	if err == gorm.ErrRecordNotFound {
		user = db.User{
			ID: "u_" + uuid.NewString()[:8], Phone: phone, Name: "山途旅人",
			AvatarURL: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80",
			Bio: "", VerifiedLabel: "未实名", Level: 1, SafetyScore: 60, Role: auth.RoleUser,
			CreatedAt: time.Now(), UpdatedAt: time.Now(),
		}
		_ = s.DB.Create(&user).Error
		_ = s.DB.Create(&db.SafetySettings{
			UserID: user.ID, DepartureRemindHours: 12,
			RemindWeather: true, RemindChecklist: true, RemindRouteRisk: true,
		}).Error
	} else if err != nil {
		c.JSON(500, gin.H{"error": "登录失败"})
		return
	}
	if user.Banned {
		c.JSON(403, gin.H{"error": "账号已封禁"})
		return
	}
	role := user.Role
	if role == "" {
		role = auth.RoleUser
	}
	token, err := auth.Issue(s.Cfg.JWTSecret, user.ID, user.Phone, role, 30*24*time.Hour)
	if err != nil {
		c.JSON(500, gin.H{"error": "签发令牌失败"})
		return
	}
	c.JSON(200, gin.H{
		"data": gin.H{
			"token": token,
			"user": gin.H{
				"id": user.ID, "name": user.Name, "phone": user.Phone, "avatar_url": user.AvatarURL,
				"role": role, "verified": user.Verified, "level": user.Level,
			},
		},
	})
}

func (s *Server) allRouteMaps() ([]map[string]any, error) {
	var rows []db.Route
	if err := s.DB.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		if err := json.Unmarshal([]byte(r.Payload), &m); err == nil {
			out = append(out, m)
		}
	}
	return out, nil
}

func (s *Server) matchProfileFor(uid string) *domain.MatchProfile {
	if uid == "" {
		return nil
	}
	var user db.User
	if err := s.DB.First(&user, "id = ?", uid).Error; err != nil {
		return nil
	}
	p := &domain.MatchProfile{
		Level: user.Level, TotalDistance: user.TotalDistance,
		TotalTrips: user.TotalTrips, TotalElev: user.TotalElev,
		SafetyScore: user.SafetyScore,
		FavoriteIDs: map[string]bool{}, CompletedIDs: map[string]bool{},
	}
	var favs []db.Favorite
	s.DB.Where("user_id = ?", uid).Find(&favs)
	for _, f := range favs {
		p.FavoriteIDs[f.RouteID] = true
	}
	var done []db.CompletedRoute
	s.DB.Where("user_id = ?", uid).Find(&done)
	for _, d := range done {
		p.CompletedIDs[d.RouteID] = true
	}
	return p
}

func (s *Server) routesDiscover(c *gin.Context) {
	routes, err := s.allRouteMaps()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	diff := c.Query("difficulty")
	province := c.Query("province")
	filtered := make([]map[string]any, 0, len(routes))
	for _, r := range routes {
		if !routeIsPublished(r) {
			continue
		}
		if diff != "" && diff != "all" && str(r["difficulty"]) != diff {
			continue
		}
		if province != "" && province != "all" && str(r["province"]) != province {
			continue
		}
		filtered = append(filtered, r)
	}
	w := domain.DefaultWeather()
	if s.Weather != nil {
		// 有省份筛选时用该省示意点天气；否则默认点
		if province != "" && province != "all" {
			if lat, lng, ok := domain.ProvinceApproxCoords(province); ok {
				w = s.Weather.BriefAt(lat, lng)
			} else {
				w = s.Weather.Brief()
			}
		} else {
			w = s.Weather.Brief()
		}
	}
	uid := s.userIDFromHeader(c)
	profile := s.matchProfileFor(uid)
	c.JSON(200, gin.H{"data": domain.BuildDiscoverFeedWithWeather(filtered, w, profile)})
}

func routeIsPublished(m map[string]any) bool {
	st := str(m["status"])
	return st == "" || st == "published"
}

func (s *Server) routesList(c *gin.Context) {
	routes, _ := s.allRouteMaps()
	diff := c.Query("difficulty")
	province := c.Query("province")
	sortKey := c.Query("sort")
	season := domain.CurrentSeason(time.Now())
	profile := s.matchProfileFor(s.userIDFromHeader(c))
	out := make([]map[string]any, 0)
	for _, r := range routes {
		if !routeIsPublished(r) {
			continue
		}
		if diff != "" && diff != "all" && r["difficulty"] != diff {
			continue
		}
		if province != "" && province != "all" && r["province"] != province {
			continue
		}
		out = append(out, domain.EnrichRouteForUser(r, season, profile))
	}
	if sortKey == "match" {
		sortByInt(out, "match_score", true)
	} else if sortKey == "difficulty" {
		sortByInt(out, "difficulty_stars", false)
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) routesSearch(c *gin.Context) {
	q := strings.ToLower(c.Query("q"))
	routes, _ := s.allRouteMaps()
	season := domain.CurrentSeason(time.Now())
	profile := s.matchProfileFor(s.userIDFromHeader(c))
	out := make([]map[string]any, 0)
	for _, r := range routes {
		if !routeIsPublished(r) {
			continue
		}
		if q == "" || strings.Contains(strings.ToLower(str(r["name"])), q) ||
			strings.Contains(strings.ToLower(str(r["location"])), q) {
			out = append(out, domain.EnrichRouteForUser(r, season, profile))
			continue
		}
		if tags, ok := r["tags"].([]any); ok {
			for _, t := range tags {
				if strings.Contains(strings.ToLower(str(t)), q) {
					out = append(out, domain.EnrichRouteForUser(r, season, profile))
					break
				}
			}
		}
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) routeDetail(c *gin.Context) {
	id := c.Param("id")
	var row db.Route
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	var listPayload map[string]any
	_ = json.Unmarshal([]byte(row.Payload), &listPayload)
	if !routeIsPublished(listPayload) {
		c.JSON(404, gin.H{"error": "路线未上架或不存在"})
		return
	}
	var detail map[string]any
	var extra db.RouteDetailExtra
	season := domain.CurrentSeason(time.Now())
	profile := s.matchProfileFor(s.userIDFromHeader(c))
	if err := s.DB.First(&extra, "route_id = ?", id).Error; err == nil {
		_ = json.Unmarshal([]byte(extra.Payload), &detail)
		detail = domain.EnrichRouteForUser(detail, season, profile)
	} else {
		detail = domain.EnrichRouteForUser(listPayload, season, profile)
	}
	var track db.TrackBundle
	if err := s.DB.First(&track, "route_id = ?", id).Error; err == nil {
		var ti any
		_ = json.Unmarshal([]byte(track.Payload), &ti)
		detail["track_info"] = ti
	}
	uid := s.userIDFromHeader(c)
	detail["favorited"] = false
	if uid != "" {
		var favCount int64
		s.DB.Model(&db.Favorite{}).Where("user_id = ? AND route_id = ?", uid, id).Count(&favCount)
		detail["favorited"] = favCount > 0
	}
	if s.Weather != nil {
		if lat, lng, ok := domain.ProvinceApproxCoords(str(detail["province"])); ok {
			detail["local_weather"] = s.Weather.BriefAt(lat, lng)
		}
	}
	c.JSON(200, gin.H{"data": detail})
}

func sortByInt(arr []map[string]any, key string, desc bool) {
	for i := 0; i < len(arr); i++ {
		for j := i + 1; j < len(arr); j++ {
			ai, aj := asInt(arr[i][key]), asInt(arr[j][key])
			if (desc && ai < aj) || (!desc && ai > aj) {
				arr[i], arr[j] = arr[j], arr[i]
			}
		}
	}
}

func asInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	default:
		return 0
	}
}

func str(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func normalizeAuthor(v any) map[string]any {
	const fallbackAvatar = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80"
	m, _ := v.(map[string]any)
	if m == nil {
		return map[string]any{
			"name":                "山途旅人",
			"avatar_url":          fallbackAvatar,
			"level":               1,
			"is_certified_leader": false,
		}
	}
	name := str(m["name"])
	if name == "" {
		name = "山途旅人"
	}
	avatar := str(m["avatar_url"])
	if avatar == "" {
		avatar = fallbackAvatar
	}
	level := 1
	switch n := m["level"].(type) {
	case float64:
		level = int(n)
	case int:
		level = n
	}
	certified, _ := m["is_certified_leader"].(bool)
	return map[string]any{
		"name":                name,
		"avatar_url":          avatar,
		"level":               level,
		"is_certified_leader": certified,
	}
}

func (s *Server) toolsList(c *gin.Context) {
	var rows []db.ToolItem
	s.DB.Find(&rows)
	out := make([]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		if m == nil {
			continue
		}
		id := str(m["id"])
		if id == "contour" || id == "satellite" {
			m["offline"] = false
			m["offline_note"] = "演示 · 未配 CDN 不可真下载"
			if id == "contour" {
				m["description"] = "等高线地形图层（演示示意图；真包需 MAP_TILE_CDN）"
			} else {
				m["description"] = "卫星影像底图（演示；真下载需瓦片 CDN）"
			}
		}
		out = append(out, m)
	}
	c.JSON(200, gin.H{"data": gin.H{
		"intro": "演示工具集中入口：海拔/指南针可接真传感器；地图图层未配 CDN 时仅为示意，不可替代专业离线地图。",
		"tools": out,
	}})
}

func (s *Server) toolsSignal(c *gin.Context) {
	bars := 1 + int(time.Now().UnixNano()%4) // 1-4
	dbm := -110 + bars*12
	tech := "4G"
	tip := "信号偏弱，关键报平安尽量选开阔处"
	if bars >= 3 {
		tech = "4G/5G"
		tip = "信号良好，可正常上报位置"
	} else if bars <= 1 {
		tech = "弱信号/无服务"
		tip = "当前几乎无信号，启用本地轨迹缓存并告知守护人失联窗口"
		bars = 0
		dbm = -112
	}
	c.JSON(200, gin.H{"data": gin.H{
		"bars": bars, "dbm": dbm, "technology": tech, "carrier": "演示运营商",
		"accuracy_note": "演示数据，非真实基站测量",
		"tip": tip, "sampled_at": time.Now().Format(time.RFC3339),
	}})
}

func (s *Server) toolsCamps(c *gin.Context) {
	var rows []db.CampPoint
	s.DB.Find(&rows)
	if len(rows) > 0 {
		out := make([]any, 0, len(rows))
		for _, r := range rows {
			var m any
			_ = json.Unmarshal([]byte(r.Payload), &m)
			if m != nil {
				out = append(out, m)
			}
		}
		c.JSON(200, gin.H{"data": out})
		return
	}
	c.JSON(200, gin.H{"data": []gin.H{
		{"id": "c1", "name": "蓝天凹营地", "distance_km": 0.8, "rating": 4.6, "note": "水源近，无信号，注意防风"},
		{"id": "c2", "name": "发云界草甸", "distance_km": 2.4, "rating": 4.3, "note": "视野好，夜间降温明显"},
		{"id": "c3", "name": "Halfway 平台", "distance_km": 3.1, "rating": 4.1, "note": "靠近客栈补给，营地收费"},
	}})
}

// --- checklist ---

func (s *Server) checklistItemsForRoute(routeID string) ([]map[string]any, string, error) {
	var route db.Route
	if err := s.DB.First(&route, "id = ?", routeID).Error; err != nil {
		return nil, "", err
	}
	var rm map[string]any
	_ = json.Unmarshal([]byte(route.Payload), &rm)
	diff := str(rm["difficulty"])
	if diff == "" {
		diff = "moderate"
	}
	var tmpl db.ChecklistTemplate
	if err := s.DB.First(&tmpl, "id = ?", diff).Error; err != nil {
		_ = s.DB.First(&tmpl, "id = ?", "base").Error
	}
	var items []map[string]any
	_ = json.Unmarshal([]byte(tmpl.Payload), &items)
	return items, str(rm["name"]), nil
}

func (s *Server) checklistGet(c *gin.Context) {
	routeID := c.Param("routeId")
	uid := s.userIDFromHeader(c)
	var trip db.Trip
	var err error = gorm.ErrRecordNotFound
	if uid != "" {
		err = s.DB.Where("user_id = ? AND route_id = ? AND status IN ?", uid, routeID, []string{"planned", "active"}).
			First(&trip).Error
	}
	if err == nil {
		var items any
		_ = json.Unmarshal([]byte(trip.ItemsJSON), &items)
		var route db.Route
		_ = s.DB.First(&route, "id = ?", routeID)
		var rm map[string]any
		_ = json.Unmarshal([]byte(route.Payload), &rm)
		c.JSON(200, gin.H{"data": gin.H{
		"trip_id": trip.ID, "route_id": routeID, "route_name": rm["name"],
		"departure_time": trip.DepartureAt.Format(time.RFC3339),
		"weather_summary": "多云，28°C，夏末湿热，注意补水防晒",
		"items": items,
		"total_weight_suggestion_grams": 0,
		"read_only": false,
	}})
		return
	}
	items, name, err := s.checklistItemsForRoute(routeID)
	if err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	c.JSON(200, gin.H{"data": gin.H{
		"route_id": routeID, "route_name": name,
		"departure_time": time.Now().Add(36 * time.Hour).Format(time.RFC3339),
		"weather_summary": "多云，28°C",
		"items": items,
		"total_weight_suggestion_grams": 0,
		"read_only": true,
		"need_trip": true,
	}})
}

func (s *Server) checklistToggle(c *gin.Context) {
	var body struct {
		ItemID  string `json:"item_id"`
		Checked bool   `json:"checked"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	routeID := c.Param("routeId")
	var trip db.Trip
	if err := s.DB.Where("user_id = ? AND route_id = ? AND status IN ?", uid, routeID, []string{"planned", "active"}).
		First(&trip).Error; err != nil {
		c.JSON(404, gin.H{"error": "请先将该路线加入行程"})
		return
	}
	var items []map[string]any
	_ = json.Unmarshal([]byte(trip.ItemsJSON), &items)
	for i := range items {
		if str(items[i]["id"]) == body.ItemID {
			items[i]["checked"] = body.Checked
		}
	}
	b, _ := json.Marshal(items)
	trip.ItemsJSON = string(b)
	s.DB.Save(&trip)
	c.JSON(200, gin.H{"data": tripBrief(&trip)})
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func parseJSONArr(s string) []map[string]any {
	var out []map[string]any
	_ = json.Unmarshal([]byte(s), &out)
	return out
}

// ensure demo helpers compile with clause import
var _ = clause.OnConflict{}
