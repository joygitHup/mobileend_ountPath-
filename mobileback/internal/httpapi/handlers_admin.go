package httpapi

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm/clause"

	"mountpath/mobileback/internal/db"
)

func (s *Server) adminAudit(c *gin.Context, action, resource, resourceID, detail string) {
	phone, _ := c.Get("phone")
	phoneStr, _ := phone.(string)
	_ = s.DB.Create(&db.AdminAuditLog{
		ID:         "al_" + uuid.NewString()[:10],
		ActorID:    s.uid(c),
		ActorPhone: phoneStr,
		Action:     action,
		Resource:   resource,
		ResourceID: resourceID,
		Detail:     detail,
		CreatedAt:  time.Now(),
	}).Error
}

func (s *Server) adminMe(c *gin.Context) {
	var user db.User
	if err := s.DB.First(&user, "id = ?", s.uid(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	role := user.Role
	if role == "" {
		role = "user"
	}
	c.JSON(200, gin.H{"data": gin.H{
		"id": user.ID, "name": user.Name, "phone": user.Phone,
		"avatar_url": user.AvatarURL, "role": role,
	}})
}

func (s *Server) adminDashboardSummary(c *gin.Context) {
	var routes, posts, leaders, tools, users, activeGuards, hiddenPosts int64
	s.DB.Model(&db.Route{}).Count(&routes)
	s.DB.Model(&db.Post{}).Count(&posts)
	s.DB.Model(&db.Post{}).Where("hidden = ?", true).Count(&hiddenPosts)
	s.DB.Model(&db.Leader{}).Count(&leaders)
	s.DB.Model(&db.ToolItem{}).Count(&tools)
	s.DB.Model(&db.User{}).Count(&users)
	s.DB.Model(&db.GuardSession{}).Where("status IN ?", []string{"active", "sos"}).Count(&activeGuards)

	var sosSettings []db.SafetySettings
	s.DB.Where("last_sos_json <> '' AND last_sos_json IS NOT NULL").Find(&sosSettings)
	var sosOpen int64
	for _, st := range sosSettings {
		var sos map[string]any
		_ = json.Unmarshal([]byte(st.LastSosJSON), &sos)
		status, _ := sos["status"].(string)
		if status != "resolved" && status != "closed" {
			sosOpen++
		}
	}

	var tripsPlanned, tripsActive, tripsCompleted int64
	s.DB.Model(&db.Trip{}).Where("status = ?", "planned").Count(&tripsPlanned)
	s.DB.Model(&db.Trip{}).Where("status = ?", "active").Count(&tripsActive)
	s.DB.Model(&db.Trip{}).Where("status = ?", "completed").Count(&tripsCompleted)

	c.JSON(200, gin.H{"data": gin.H{
		"routes": routes, "posts": posts, "hidden_posts": hiddenPosts,
		"leaders": leaders, "tools": tools, "users": users,
		"active_guards": activeGuards, "sos_records": sosOpen,
		"trips_planned": tripsPlanned, "trips_active": tripsActive, "trips_completed": tripsCompleted,
	}})
}

func (s *Server) adminDashboardInsights(c *gin.Context) {
	var unanswered int64
	var posts []db.Post
	s.DB.Where("type = ? AND hidden = ?", "question", false).Find(&posts)
	for _, p := range posts {
		var m map[string]any
		_ = json.Unmarshal([]byte(p.Payload), &m)
		if m == nil {
			continue
		}
		if answered, _ := m["answered"].(bool); !answered {
			unanswered++
		}
	}

	type bucket struct {
		Label string `json:"label"`
		Count int64  `json:"count"`
	}
	safetyBuckets := []bucket{
		{Label: "0-40", Count: 0},
		{Label: "41-60", Count: 0},
		{Label: "61-80", Count: 0},
		{Label: "81-100", Count: 0},
	}
	var users []db.User
	s.DB.Find(&users)
	for _, u := range users {
		switch {
		case u.SafetyScore <= 40:
			safetyBuckets[0].Count++
		case u.SafetyScore <= 60:
			safetyBuckets[1].Count++
		case u.SafetyScore <= 80:
			safetyBuckets[2].Count++
		default:
			safetyBuckets[3].Count++
		}
	}

	var pubTracks, officialTracks int64
	s.DB.Model(&db.PublishedTrack{}).Count(&pubTracks)
	s.DB.Model(&db.PublishedTrack{}).Where("is_official = ?", true).Count(&officialTracks)

	c.JSON(200, gin.H{"data": gin.H{
		"unanswered_questions": unanswered,
		"safety_score_dist":    safetyBuckets,
		"published_tracks":     pubTracks,
		"official_tracks":      officialTracks,
		"user_count":           len(users),
	}})
}

// —— Routes ——

func (s *Server) adminRoutesList(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	var rows []db.Route
	tx := s.DB.Order("id asc")
	if q != "" {
		like := "%" + q + "%"
		tx = tx.Where("name LIKE ? OR province LIKE ? OR id LIKE ?", like, like, like)
	}
	tx.Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		if m == nil {
			m = map[string]any{"id": r.ID, "name": r.Name}
		}
		m["_meta"] = gin.H{"province": r.Province, "difficulty": r.Difficulty, "match_score": r.MatchScore}
		out = append(out, m)
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminRouteGet(c *gin.Context) {
	id := c.Param("id")
	var row db.Route
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	var payload map[string]any
	_ = json.Unmarshal([]byte(row.Payload), &payload)
	var extra db.RouteDetailExtra
	var detail any
	if err := s.DB.First(&extra, "route_id = ?", id).Error; err == nil {
		_ = json.Unmarshal([]byte(extra.Payload), &detail)
	}
	c.JSON(200, gin.H{"data": gin.H{"route": payload, "detail": detail}})
}

func routeFieldsFromPayload(payload map[string]any) (id, name, province, difficulty string, match int) {
	id = str(payload["id"])
	name = str(payload["name"])
	province = str(payload["province"])
	difficulty = str(payload["difficulty"])
	if v, ok := payload["match_score"].(float64); ok {
		match = int(v)
	}
	return
}

func (s *Server) adminRouteCreate(c *gin.Context) {
	var body struct {
		Route  map[string]any `json:"route"`
		Detail map[string]any `json:"detail"`
	}
	if err := c.BindJSON(&body); err != nil || body.Route == nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	id, name, province, difficulty, match := routeFieldsFromPayload(body.Route)
	if id == "" {
		id = "r_" + uuid.NewString()[:8]
		body.Route["id"] = id
	}
	b, _ := json.Marshal(body.Route)
	rec := db.Route{ID: id, Payload: string(b), Name: name, Province: province, Difficulty: difficulty, MatchScore: match}
	if err := s.DB.Create(&rec).Error; err != nil {
		c.JSON(400, gin.H{"error": "创建失败: " + err.Error()})
		return
	}
	if body.Detail != nil {
		db2, _ := json.Marshal(body.Detail)
		_ = s.DB.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.RouteDetailExtra{RouteID: id, Payload: string(db2)}).Error
	}
	s.adminAudit(c, "create_route", "route", id, name)
	c.JSON(200, gin.H{"data": body.Route})
}

func (s *Server) adminRoutePatch(c *gin.Context) {
	id := c.Param("id")
	var row db.Route
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	var body struct {
		Route  map[string]any `json:"route"`
		Detail map[string]any `json:"detail"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	if body.Route != nil {
		body.Route["id"] = id
		_, name, province, difficulty, match := routeFieldsFromPayload(body.Route)
		b, _ := json.Marshal(body.Route)
		row.Payload = string(b)
		row.Name = name
		row.Province = province
		row.Difficulty = difficulty
		row.MatchScore = match
		_ = s.DB.Save(&row).Error
	}
	if body.Detail != nil {
		db2, _ := json.Marshal(body.Detail)
		_ = s.DB.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.RouteDetailExtra{RouteID: id, Payload: string(db2)}).Error
	}
	s.adminAudit(c, "patch_route", "route", id, row.Name)
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) adminRouteDelete(c *gin.Context) {
	id := c.Param("id")
	s.DB.Delete(&db.Route{}, "id = ?", id)
	s.DB.Delete(&db.RouteDetailExtra{}, "route_id = ?", id)
	s.DB.Delete(&db.TrackBundle{}, "route_id = ?", id)
	s.adminAudit(c, "delete_route", "route", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// —— Tracks ——

func (s *Server) adminTracksList(c *gin.Context) {
	var rows []db.TrackBundle
	s.DB.Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var m any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		out = append(out, map[string]any{"route_id": r.RouteID, "payload": m})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminTrackGet(c *gin.Context) {
	var row db.TrackBundle
	if err := s.DB.First(&row, "route_id = ?", c.Param("routeId")).Error; err != nil {
		c.JSON(404, gin.H{"error": "轨迹不存在"})
		return
	}
	var m any
	_ = json.Unmarshal([]byte(row.Payload), &m)
	c.JSON(200, gin.H{"data": gin.H{"route_id": row.RouteID, "payload": m}})
}

func (s *Server) adminTrackPut(c *gin.Context) {
	routeID := c.Param("routeId")
	var body any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	b, _ := json.Marshal(body)
	_ = s.DB.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.TrackBundle{RouteID: routeID, Payload: string(b)}).Error
	s.adminAudit(c, "put_track", "track", routeID, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) adminPublishedTracksList(c *gin.Context) {
	var rows []db.PublishedTrack
	s.DB.Order("id desc").Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		out = append(out, map[string]any{
			"id": r.ID, "route_id": r.RouteID,
			"is_official": r.IsOfficial, "recommended": r.Recommended, "hidden": r.Hidden,
			"payload": m,
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminPublishedTrackPatch(c *gin.Context) {
	id := c.Param("id")
	var row db.PublishedTrack
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "轨迹不存在"})
		return
	}
	var body struct {
		IsOfficial  *bool `json:"is_official"`
		Recommended *bool `json:"recommended"`
		Hidden      *bool `json:"hidden"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	if body.IsOfficial != nil {
		row.IsOfficial = *body.IsOfficial
	}
	if body.Recommended != nil {
		row.Recommended = *body.Recommended
	}
	if body.Hidden != nil {
		row.Hidden = *body.Hidden
	}
	_ = s.DB.Save(&row).Error
	s.adminAudit(c, "patch_published_track", "published_track", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// —— Checklist ——

func (s *Server) adminChecklistList(c *gin.Context) {
	var rows []db.ChecklistTemplate
	s.DB.Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var m any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		out = append(out, map[string]any{"id": r.ID, "payload": m})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminChecklistGet(c *gin.Context) {
	var row db.ChecklistTemplate
	if err := s.DB.First(&row, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(404, gin.H{"error": "模板不存在"})
		return
	}
	var m any
	_ = json.Unmarshal([]byte(row.Payload), &m)
	c.JSON(200, gin.H{"data": gin.H{"id": row.ID, "payload": m}})
}

func (s *Server) adminChecklistPut(c *gin.Context) {
	id := c.Param("id")
	var body any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	b, _ := json.Marshal(body)
	_ = s.DB.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.ChecklistTemplate{ID: id, Payload: string(b)}).Error
	s.adminAudit(c, "put_checklist", "checklist", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// —— Leaders ——

func (s *Server) adminLeadersList(c *gin.Context) {
	var rows []db.Leader
	s.DB.Find(&rows)
	out := make([]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		if m != nil {
			out = append(out, m)
		}
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminLeaderCreate(c *gin.Context) {
	var body map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	id := str(body["id"])
	if id == "" {
		id = "l_" + uuid.NewString()[:8]
		body["id"] = id
	}
	b, _ := json.Marshal(body)
	if err := s.DB.Create(&db.Leader{ID: id, Payload: string(b)}).Error; err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	s.adminAudit(c, "create_leader", "leader", id, str(body["name"]))
	c.JSON(200, gin.H{"data": body})
}

func (s *Server) adminLeaderPatch(c *gin.Context) {
	id := c.Param("id")
	var row db.Leader
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "领队不存在"})
		return
	}
	var body map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	body["id"] = id
	b, _ := json.Marshal(body)
	row.Payload = string(b)
	_ = s.DB.Save(&row).Error
	s.adminAudit(c, "patch_leader", "leader", id, str(body["name"]))
	c.JSON(200, gin.H{"data": body})
}

func (s *Server) adminLeaderDelete(c *gin.Context) {
	id := c.Param("id")
	s.DB.Delete(&db.Leader{}, "id = ?", id)
	s.adminAudit(c, "delete_leader", "leader", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// —— Tools ——

func (s *Server) adminToolsList(c *gin.Context) {
	var rows []db.ToolItem
	s.DB.Find(&rows)
	out := make([]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		if m != nil {
			out = append(out, m)
		}
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminToolCreate(c *gin.Context) {
	var body map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	id := str(body["id"])
	if id == "" {
		id = "t_" + uuid.NewString()[:8]
		body["id"] = id
	}
	b, _ := json.Marshal(body)
	if err := s.DB.Create(&db.ToolItem{ID: id, Payload: string(b)}).Error; err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	s.adminAudit(c, "create_tool", "tool", id, str(body["name"]))
	c.JSON(200, gin.H{"data": body})
}

func (s *Server) adminToolPatch(c *gin.Context) {
	id := c.Param("id")
	var row db.ToolItem
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "工具不存在"})
		return
	}
	var body map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	body["id"] = id
	b, _ := json.Marshal(body)
	row.Payload = string(b)
	_ = s.DB.Save(&row).Error
	s.adminAudit(c, "patch_tool", "tool", id, str(body["name"]))
	c.JSON(200, gin.H{"data": body})
}

func (s *Server) adminToolDelete(c *gin.Context) {
	id := c.Param("id")
	s.DB.Delete(&db.ToolItem{}, "id = ?", id)
	s.adminAudit(c, "delete_tool", "tool", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// —— Community moderation ——

func (s *Server) adminPostsList(c *gin.Context) {
	var rows []db.Post
	s.DB.Order("created_at desc").Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, p := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(p.Payload), &m)
		if m == nil {
			m = map[string]any{}
		}
		m["id"] = p.ID
		m["user_id"] = p.UserID
		m["type"] = p.Type
		m["hidden"] = p.Hidden
		m["created_at"] = p.CreatedAt
		out = append(out, m)
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminPostPatch(c *gin.Context) {
	id := c.Param("id")
	var row db.Post
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	var body struct {
		Hidden   *bool          `json:"hidden"`
		IsPaid   *bool          `json:"is_paid"`
		Price    *float64       `json:"price"`
		Answered *bool          `json:"answered"`
		Patch    map[string]any `json:"payload"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	if body.Hidden != nil {
		row.Hidden = *body.Hidden
	}
	var m map[string]any
	_ = json.Unmarshal([]byte(row.Payload), &m)
	if m == nil {
		m = map[string]any{}
	}
	if body.IsPaid != nil {
		m["is_paid"] = *body.IsPaid
	}
	if body.Price != nil {
		m["price"] = *body.Price
	}
	if body.Answered != nil {
		m["answered"] = *body.Answered
	}
	for k, v := range body.Patch {
		m[k] = v
	}
	b, _ := json.Marshal(m)
	row.Payload = string(b)
	_ = s.DB.Save(&row).Error
	s.adminAudit(c, "patch_post", "post", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "hidden": row.Hidden}})
}

func (s *Server) adminPostDelete(c *gin.Context) {
	id := c.Param("id")
	s.DB.Delete(&db.Comment{}, "post_id = ?", id)
	s.DB.Delete(&db.PostLike{}, "post_id = ?", id)
	s.DB.Delete(&db.CompanionInterest{}, "post_id = ?", id)
	s.DB.Delete(&db.Post{}, "id = ?", id)
	s.adminAudit(c, "delete_post", "post", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) adminCommentsList(c *gin.Context) {
	postID := c.Query("post_id")
	var rows []db.Comment
	tx := s.DB.Order("created_at desc").Limit(200)
	if postID != "" {
		tx = tx.Where("post_id = ?", postID)
	}
	tx.Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, cm := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(cm.Payload), &m)
		out = append(out, map[string]any{
			"id": cm.ID, "post_id": cm.PostID, "user_id": cm.UserID,
			"created_at": cm.CreatedAt, "payload": m,
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminCommentDelete(c *gin.Context) {
	id := c.Param("id")
	s.DB.Delete(&db.CommentLike{}, "comment_id = ?", id)
	s.DB.Delete(&db.Comment{}, "id = ?", id)
	s.adminAudit(c, "delete_comment", "comment", id, "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// —— Users ——

func (s *Server) adminUsersList(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	var rows []db.User
	tx := s.DB.Order("created_at desc")
	if q != "" {
		like := "%" + q + "%"
		tx = tx.Where("phone LIKE ? OR name LIKE ? OR id LIKE ?", like, like, like)
	}
	tx.Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, u := range rows {
		role := u.Role
		if role == "" {
			role = "user"
		}
		out = append(out, gin.H{
			"id": u.ID, "phone": u.Phone, "name": u.Name, "avatar_url": u.AvatarURL,
			"verified": u.Verified, "verified_label": u.VerifiedLabel,
			"level": u.Level, "safety_score": u.SafetyScore, "role": role, "banned": u.Banned,
			"total_distance": u.TotalDistance, "total_trips": u.TotalTrips,
			"created_at": u.CreatedAt,
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminUserPatch(c *gin.Context) {
	id := c.Param("id")
	var user db.User
	if err := s.DB.First(&user, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	var body struct {
		Verified      *bool   `json:"verified"`
		VerifiedLabel *string `json:"verified_label"`
		Level         *int    `json:"level"`
		SafetyScore   *int    `json:"safety_score"`
		Role          *string `json:"role"`
		Banned        *bool   `json:"banned"`
		Name          *string `json:"name"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	if body.Verified != nil {
		user.Verified = *body.Verified
		if *body.Verified && (body.VerifiedLabel == nil || *body.VerifiedLabel == "") {
			user.VerifiedLabel = "已实名"
		}
	}
	if body.VerifiedLabel != nil {
		user.VerifiedLabel = *body.VerifiedLabel
	}
	if body.Level != nil {
		user.Level = *body.Level
	}
	if body.SafetyScore != nil {
		user.SafetyScore = *body.SafetyScore
	}
	if body.Role != nil {
		actorRole, _ := c.Get("role")
		if actorRole != "admin" {
			c.JSON(403, gin.H{"error": "仅管理员可变更角色"})
			return
		}
		role := strings.TrimSpace(*body.Role)
		if role != "user" && role != "ops" && role != "admin" {
			c.JSON(400, gin.H{"error": "角色无效"})
			return
		}
		user.Role = role
	}
	if body.Banned != nil {
		user.Banned = *body.Banned
	}
	if body.Name != nil {
		user.Name = *body.Name
	}
	user.UpdatedAt = time.Now()
	_ = s.DB.Save(&user).Error
	s.adminAudit(c, "patch_user", "user", id, user.Phone)
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// —— Safety / Guard ——

func (s *Server) adminGuardSessions(c *gin.Context) {
	status := c.Query("status")
	var rows []db.GuardSession
	tx := s.DB.Order("started_at desc").Limit(100)
	switch status {
	case "open":
		tx = tx.Where("status IN ?", []string{"active", "sos"})
	case "":
		// all
	default:
		tx = tx.Where("status = ?", status)
	}
	tx.Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, g := range rows {
		var loc any
		_ = json.Unmarshal([]byte(g.LastLocationJSON), &loc)
		var guardians any
		_ = json.Unmarshal([]byte(g.GuardiansJSON), &guardians)
		var user db.User
		_ = s.DB.First(&user, "id = ?", g.UserID)
		routeName := g.RouteID
		if g.RouteID != "" {
			var route db.Route
			if s.DB.First(&route, "id = ?", g.RouteID).Error == nil {
				routeName = route.Name
			}
		}
		overtime := false
		if g.Status == "active" || g.Status == "sos" {
			limit := time.Duration(g.PlannedDurationHours) * time.Hour
			if limit <= 0 {
				limit = 8 * time.Hour
			}
			overtime = time.Since(g.StartedAt) > limit
		}
		out = append(out, gin.H{
			"id": g.ID, "user_id": g.UserID, "user_name": user.Name, "phone": user.Phone,
			"route_id": g.RouteID, "route_name": routeName, "trip_id": g.TripID,
			"status": g.Status, "started_at": g.StartedAt,
			"planned_duration_hours": g.PlannedDurationHours,
			"last_location": loc, "guardians": guardians,
			"overtime": overtime,
			"overtime_notified_at": g.OvertimeNotifiedAt,
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminGuardSessionPatch(c *gin.Context) {
	id := c.Param("id")
	var row db.GuardSession
	if err := s.DB.First(&row, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "会话不存在"})
		return
	}
	var body struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	wasSos := row.Status == "sos"
	if body.Status != "" {
		// 兼容旧前端 stopped
		if body.Status == "stopped" {
			body.Status = "completed"
		}
		row.Status = body.Status
	}
	_ = s.DB.Save(&row).Error
	if wasSos || row.Status == "completed" {
		s.resolveLatestSos(row.UserID, "ops_guard:"+strings.TrimSpace(body.Note))
	}
	if row.TripID != nil && (row.Status == "completed") {
		s.DB.Model(&db.Trip{}).Where("id = ? AND user_id = ?", *row.TripID, row.UserID).Updates(map[string]any{
			"status": "planned", "guard_session_id": nil,
		})
	}
	s.adminAudit(c, "patch_guard", "guard", id, body.Note)
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) adminSosList(c *gin.Context) {
	onlyOpen := c.Query("open") != "0"
	var rows []db.SafetySettings
	s.DB.Where("last_sos_json <> '' AND last_sos_json IS NOT NULL").Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		var sos map[string]any
		_ = json.Unmarshal([]byte(r.LastSosJSON), &sos)
		if sos == nil {
			sos = map[string]any{}
		}
		status, _ := sos["status"].(string)
		if status == "" {
			status = "recorded"
			sos["status"] = status
		}
		if onlyOpen && (status == "resolved" || status == "closed") {
			continue
		}
		var user db.User
		_ = s.DB.First(&user, "id = ?", r.UserID)
		out = append(out, gin.H{
			"user_id": r.UserID, "user_name": user.Name, "phone": user.Phone,
			"status": status, "sos": sos,
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminSosResolve(c *gin.Context) {
	userID := c.Param("userId")
	var body struct {
		Note string `json:"note"`
	}
	_ = c.BindJSON(&body)
	var user db.User
	if err := s.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	s.DB.Model(&db.GuardSession{}).Where("user_id = ? AND status IN ?", userID, []string{"active", "sos"}).
		Update("status", "completed")
	s.DB.Model(&db.Trip{}).Where("user_id = ? AND status = ?", userID, "active").Updates(map[string]any{
		"status": "planned", "guard_session_id": nil,
	})
	reason := "ops_resolved"
	if strings.TrimSpace(body.Note) != "" {
		reason = reason + ":" + strings.TrimSpace(body.Note)
	}
	s.resolveLatestSos(userID, reason)
	s.adminAudit(c, "resolve_sos", "sos", userID, body.Note)
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) adminTripsList(c *gin.Context) {
	status := c.Query("status")
	var rows []db.Trip
	tx := s.DB.Order("updated_at desc").Limit(200)
	if status != "" {
		tx = tx.Where("status = ?", status)
	}
	tx.Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, t := range rows {
		var user db.User
		_ = s.DB.First(&user, "id = ?", t.UserID)
		routeName := t.RouteID
		var route db.Route
		if s.DB.First(&route, "id = ?", t.RouteID).Error == nil {
			routeName = route.Name
		}
		out = append(out, gin.H{
			"id": t.ID, "user_id": t.UserID, "user_name": user.Name, "phone": user.Phone,
			"route_id": t.RouteID, "route_name": routeName, "status": t.Status,
			"departure_at": t.DepartureAt, "guard_session_id": t.GuardSessionID,
			"planned_duration_hours": t.PlannedDurationHours,
			"updated_at": t.UpdatedAt,
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminTripForceEnd(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Abandoned bool   `json:"abandoned"`
		Note      string `json:"note"`
	}
	_ = c.BindJSON(&body)
	var trip db.Trip
	if err := s.DB.First(&trip, "id = ?", id).Error; err != nil {
		c.JSON(404, gin.H{"error": "行程不存在"})
		return
	}
	uid := trip.UserID
	s.DB.Model(&db.GuardSession{}).Where("user_id = ? AND status IN ?", uid, []string{"active", "sos"}).
		Update("status", "completed")
	s.resolveLatestSos(uid, "ops_trip_force_end")
	if body.Abandoned {
		s.DB.Delete(&trip)
	} else {
		now := time.Now()
		s.recordOutingComplete(uid, trip.RouteID, &now, "")
		s.DB.Delete(&trip)
	}
	s.adminAudit(c, "force_end_trip", "trip", id, body.Note)
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "abandoned": body.Abandoned}})
}

func (s *Server) adminCompanionInterests(c *gin.Context) {
	var rows []db.CompanionInterest
	s.DB.Order("created_at desc").Limit(200).Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		var post db.Post
		_ = s.DB.First(&post, "id = ?", row.PostID)
		var payload map[string]any
		_ = json.Unmarshal([]byte(post.Payload), &payload)
		title := str(payload["title"])
		if title == "" {
			title = post.ID
		}
		var joiner db.User
		_ = s.DB.First(&joiner, "id = ?", row.UserID)
		var owner db.User
		_ = s.DB.First(&owner, "id = ?", post.UserID)
		out = append(out, gin.H{
			"post_id": row.PostID, "post_title": title, "post_owner": owner.Name,
			"user_id": row.UserID, "user_name": joiner.Name, "phone": joiner.Phone,
			"note": row.Note, "created_at": row.CreatedAt,
			"route_id": str(payload["route_id"]), "route_name": str(payload["route_name"]),
		})
	}
	c.JSON(200, gin.H{"data": out})
}

// —— Legal / camps / signals / audit ——

func (s *Server) adminLegalList(c *gin.Context) {
	var rows []db.LegalDoc
	s.DB.Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		var sections any
		_ = json.Unmarshal([]byte(r.Payload), &sections)
		out = append(out, gin.H{
			"id": r.ID, "title": r.Title, "updated_at": r.UpdatedAt, "sections": sections,
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminLegalPut(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Title     string `json:"title"`
		UpdatedAt string `json:"updated_at"`
		Sections  any    `json:"sections"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	b, _ := json.Marshal(body.Sections)
	if body.UpdatedAt == "" {
		body.UpdatedAt = time.Now().Format("2006-01-02")
	}
	_ = s.DB.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.LegalDoc{
		ID: id, Title: body.Title, UpdatedAt: body.UpdatedAt, Payload: string(b),
	}).Error
	s.adminAudit(c, "put_legal", "legal", id, body.Title)
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) adminCampsList(c *gin.Context) {
	var rows []db.CampPoint
	s.DB.Find(&rows)
	out := make([]any, 0, len(rows))
	for _, r := range rows {
		var m any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		out = append(out, m)
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminCampsPut(c *gin.Context) {
	var body []map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	s.DB.Where("1 = 1").Delete(&db.CampPoint{})
	for _, item := range body {
		id := str(item["id"])
		if id == "" {
			id = "camp_" + uuid.NewString()[:8]
			item["id"] = id
		}
		b, _ := json.Marshal(item)
		_ = s.DB.Create(&db.CampPoint{ID: id, Payload: string(b)}).Error
	}
	s.adminAudit(c, "put_camps", "camp", "", "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "count": len(body)}})
}

func (s *Server) adminSignalsList(c *gin.Context) {
	var rows []db.SignalPoint
	s.DB.Find(&rows)
	out := make([]any, 0, len(rows))
	for _, r := range rows {
		var m any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		out = append(out, m)
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) adminSignalsPut(c *gin.Context) {
	var body []map[string]any
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "参数无效"})
		return
	}
	s.DB.Where("1 = 1").Delete(&db.SignalPoint{})
	for _, item := range body {
		id := str(item["id"])
		if id == "" {
			id = "sig_" + uuid.NewString()[:8]
			item["id"] = id
		}
		b, _ := json.Marshal(item)
		_ = s.DB.Create(&db.SignalPoint{ID: id, Payload: string(b)}).Error
	}
	s.adminAudit(c, "put_signals", "signal", "", "")
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "count": len(body)}})
}

func (s *Server) adminAuditList(c *gin.Context) {
	action := strings.TrimSpace(c.Query("action"))
	resource := strings.TrimSpace(c.Query("resource"))
	actor := strings.TrimSpace(c.Query("actor"))
	q := strings.TrimSpace(c.Query("q"))
	page := 1
	limit := 50
	if v := c.Query("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	tx := s.DB.Model(&db.AdminAuditLog{})
	if action != "" {
		tx = tx.Where("action = ?", action)
	}
	if resource != "" {
		tx = tx.Where("resource = ?", resource)
	}
	if actor != "" {
		like := "%" + actor + "%"
		tx = tx.Where("actor_phone LIKE ? OR actor_id LIKE ?", like, like)
	}
	if q != "" {
		like := "%" + q + "%"
		tx = tx.Where("detail LIKE ? OR resource_id LIKE ? OR action LIKE ?", like, like, like)
	}
	var total int64
	tx.Count(&total)
	var rows []db.AdminAuditLog
	tx.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&rows)
	c.JSON(200, gin.H{"data": gin.H{
		"items": rows, "total": total, "page": page, "limit": limit,
	}})
}
