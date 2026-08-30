package httpapi

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"mountpath/mobileback/internal/db"
	"mountpath/mobileback/internal/domain"
	"mountpath/mobileback/internal/notify"
)

const trackDisclaimer = `本人知悉户外徒步存在迷路、失联、受伤等风险，轨迹与导航功能仅供辅助参考，不能替代专业判断与现场观察。

在未开启「实时守护」的情况下使用轨迹，紧急联系人将无法实时获知我的位置；本人自愿承担由此产生的风险与后果。

通视、信号、海拔等工具结果仅为估算，受天气、植被、设备精度影响，野外请以实际环境为准。

如遇紧急情况，我将主动拨打当地救援电话，并尽快联系紧急联系人。`

func (s *Server) currentTrip(uid string) *db.Trip {
	var trip db.Trip
	err := s.DB.Where("user_id = ? AND status IN ?", uid, []string{"active", "planned"}).
		Order("CASE status WHEN 'active' THEN 0 ELSE 1 END").
		First(&trip).Error
	if err != nil {
		return nil
	}
	return &trip
}

/** 行程对外 JSON（snake_case，兼容 client） */
func tripBrief(t *db.Trip) gin.H {
	if t == nil {
		return nil
	}
	out := gin.H{
		"id": t.ID, "user_id": t.UserID, "route_id": t.RouteID, "status": t.Status,
		"departure_at": t.DepartureAt.Format(time.RFC3339),
		"planned_duration_hours": t.PlannedDurationHours,
		"created_at": t.CreatedAt.Format(time.RFC3339),
		"updated_at": t.UpdatedAt.Format(time.RFC3339),
		"disclaimer_accepted": t.DisclaimerAcceptedAt != nil,
	}
	if t.GuardSessionID != nil {
		out["guard_session_id"] = *t.GuardSessionID
	} else {
		out["guard_session_id"] = nil
	}
	if t.DisclaimerAcceptedAt != nil {
		out["disclaimer_accepted_at"] = t.DisclaimerAcceptedAt.Format(time.RFC3339)
	}
	if t.CompletedAt != nil {
		out["completed_at"] = t.CompletedAt.Format(time.RFC3339)
	}
	var guardians []string
	_ = json.Unmarshal([]byte(t.GuardiansJSON), &guardians)
	if guardians == nil {
		guardians = []string{}
	}
	out["guardians"] = guardians
	items := parseJSONArr(t.ItemsJSON)
	out["items"] = items
	return out
}

func (s *Server) clearUserTrips(uid string) {
	s.DB.Where("user_id = ?", uid).Delete(&db.Trip{})
	s.DB.Model(&db.GuardSession{}).Where("user_id = ? AND status = ?", uid, "active").
		Update("status", "completed")
}

func (s *Server) buildChecklistItems(routeID string) string {
	items, _, err := s.checklistItemsForRoute(routeID)
	if err != nil {
		return "[]"
	}
	for i := range items {
		// demo: partial checks
		if cat, _ := items[i]["category"].(string); cat == "essential" && i%3 == 0 {
			items[i]["checked"] = true
		} else if cat == "recommended" && i%2 == 0 {
			items[i]["checked"] = true
		} else {
			items[i]["checked"] = false
		}
	}
	return mustJSON(items)
}

func (s *Server) tripsCreate(c *gin.Context) {
	var body struct {
		RouteID     string `json:"route_id"`
		DepartureAt string `json:"departure_at"`
	}
	if err := c.BindJSON(&body); err != nil || body.RouteID == "" || body.DepartureAt == "" {
		c.JSON(400, gin.H{"error": "请设置预计出发时间"})
		return
	}
	when, err := time.Parse(time.RFC3339, body.DepartureAt)
	if err != nil {
		when, err = time.Parse(time.RFC3339Nano, body.DepartureAt)
	}
	if err != nil {
		c.JSON(400, gin.H{"error": "预计出发时间格式无效"})
		return
	}
	var route db.Route
	if err := s.DB.First(&route, "id = ?", body.RouteID).Error; err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	uid := s.uid(c)
	cur := s.currentTrip(uid)
	if cur != nil && cur.RouteID == body.RouteID {
		cur.DepartureAt = when
		if cur.Status != "active" {
			cur.Status = "planned"
			cur.CompletedAt = nil
		}
		s.DB.Save(cur)
		c.JSON(200, gin.H{"data": tripBrief(cur)})
		return
	}
	s.clearUserTrips(uid)
	var rm map[string]any
	_ = json.Unmarshal([]byte(route.Payload), &rm)
	hours := plannedHoursFromRoutePayload(rm)
	trip := db.Trip{
		ID: "trip_" + uuid.NewString()[:10], UserID: uid, RouteID: body.RouteID,
		Status: "planned", DepartureAt: when, PlannedDurationHours: hours,
		GuardiansJSON: mustJSON(s.contactGuardianNames(uid)), ItemsJSON: s.buildChecklistItems(body.RouteID),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	s.DB.Create(&trip)
	c.JSON(200, gin.H{"data": tripBrief(&trip)})
}

func (s *Server) tripsCurrent(c *gin.Context) {
	uid := s.uid(c)
	trip := s.currentTrip(uid)
	if trip == nil {
		c.JSON(200, gin.H{"data": nil})
		return
	}
	var route db.Route
	_ = s.DB.First(&route, "id = ?", trip.RouteID)
	var rm map[string]any
	_ = json.Unmarshal([]byte(route.Payload), &rm)
	c.JSON(200, gin.H{"data": gin.H{
		"id": trip.ID, "route_id": trip.RouteID, "status": trip.Status,
		"departure_at": trip.DepartureAt.Format(time.RFC3339),
		"route_name": rm["name"],
	}})
}

func (s *Server) contactGuardianNames(uid string) []string {
	var contacts []db.EmergencyContact
	s.DB.Where("user_id = ?", uid).Order("is_primary desc, created_at asc").Find(&contacts)
	names := make([]string, 0, len(contacts))
	for _, ct := range contacts {
		if ct.Name != "" {
			names = append(names, ct.Name)
		}
	}
	return names
}

func (s *Server) listTripHistory(uid string) []gin.H {
	var done []db.CompletedRoute
	s.DB.Where("user_id = ?", uid).Order("completed_at desc").Limit(12).Find(&done)
	out := make([]gin.H, 0, len(done))
	for _, r := range done {
		out = append(out, gin.H{
			"id": r.ID, "route_id": r.RouteID, "route_name": r.RouteName,
			"distance_km": r.DistanceKm, "elevation_gain_m": r.ElevationGainM,
			"duration_hours": r.DurationHours,
			"completed_at": r.CompletedAt.Format(time.RFC3339),
			"completed_label": r.CompletedAt.Format("01/02"),
		})
	}
	return out
}

func (s *Server) tripsBoard(c *gin.Context) {
	uid := s.uid(c)
	weather := domain.DefaultWeather()
	if s.Weather != nil {
		weather = s.Weather.Brief()
	}
	trip := s.currentTrip(uid)
	history := s.listTripHistory(uid)
	favorites := s.listFavoriteMaps(uid)
	guardians := s.contactGuardianNames(uid)

	if trip == nil {
		c.JSON(200, gin.H{"data": gin.H{
			"safety_tip": weather.Advice, "weather": weather,
			"disclaimer_text": trackDisclaimer, "current": nil, "history": history, "favorites": favorites,
			"guardians": guardians, "contacts_ready": len(guardians) > 0,
		}})
		return
	}
	var route db.Route
	_ = s.DB.First(&route, "id = ?", trip.RouteID)
	var rm map[string]any
	_ = json.Unmarshal([]byte(route.Payload), &rm)
	enriched := domain.EnrichRoute(rm, domain.CurrentSeason(time.Now()))
	items := parseJSONArr(trip.ItemsJSON)
	progress := progressOf(items)

	var guard db.GuardSession
	guardActive := false
	if err := s.DB.Where("user_id = ? AND status = ?", uid, "active").First(&guard).Error; err == nil {
		if guard.RouteID == trip.RouteID || (trip.GuardSessionID != nil && *trip.GuardSessionID == guard.ID) {
			guardActive = true
		}
	}
	trackAccess := canUseTrack(trip, guardActive)
	hours := int(time.Until(trip.DepartureAt).Hours())
	depLabel := "已到/已过出发时间"
	if hours > 0 && hours < 24 {
		depLabel = itoa(hours) + " 小时后出发"
	} else if hours >= 24 {
		depLabel = itoa((hours+23)/24) + " 天后出发"
	}

	next := gin.H{"key": "guard", "label": "开启守护", "hint": "出发当天建议开启"}
	if !progress["essential_ready"].(bool) {
		next = gin.H{"key": "checklist", "label": "补齐必带", "hint": "还有缺口"}
	} else if trackAccess["allowed"].(bool) {
		next = gin.H{"key": "track", "label": "使用轨迹", "hint": trackAccess["message"]}
	} else {
		next = gin.H{"key": "track_gate", "label": "使用轨迹", "hint": "需先开启守护或签署免责"}
	}

	current := gin.H{
		"id": trip.ID, "status": trip.Status, "route_id": trip.RouteID,
		"route_name": rm["name"], "location": rm["location"], "image_url": rm["image_url"],
		"distance": rm["distance"], "elevation_gain": rm["elevation_gain"],
		"estimated_duration": rm["estimated_duration"],
		"departure_at": trip.DepartureAt.Format(time.RFC3339),
		"departure_label": depLabel,
		"planned_duration_hours": trip.PlannedDurationHours,
		"guardians": guardians,
		"contacts_ready": len(guardians) > 0,
		"decision_summary": enriched["decision_summary"],
		"risk_level": enriched["risk_level"],
		"key_checkpoint": enriched["key_checkpoint"],
		"progress": progress,
		"guard_active": guardActive,
		"disclaimer_accepted": trip.DisclaimerAcceptedAt != nil,
		"disclaimer_accepted_at": trip.DisclaimerAcceptedAt,
		"track_access": trackAccess,
		"next_action": next,
		"weather_summary": weather.Condition + " " + itoa(weather.TempC) + "°C · " + weather.SuitableLabel,
	}

	c.JSON(200, gin.H{"data": gin.H{
		"safety_tip": weather.Advice, "weather": weather,
		"disclaimer_text": trackDisclaimer, "current": current, "history": history, "favorites": favorites,
		"guardians": guardians, "contacts_ready": len(guardians) > 0,
	}})
}

func progressOf(items []map[string]any) gin.H {
	essTotal, essDone, total, done := 0, 0, len(items), 0
	gaps := []map[string]any{}
	for _, it := range items {
		checked, _ := it["checked"].(bool)
		if checked {
			done++
		}
		if cat, _ := it["category"].(string); cat == "essential" {
			essTotal++
			if checked {
				essDone++
			} else {
				gaps = append(gaps, gin.H{"id": it["id"], "name": it["name"], "description": it["description"]})
			}
		}
	}
	return gin.H{
		"essential_total": essTotal, "essential_done": essDone,
		"total": total, "done": done,
		"essential_ready": essDone >= essTotal && essTotal > 0,
		"gaps": gaps,
	}
}

func canUseTrack(trip *db.Trip, guardActive bool) gin.H {
	if guardActive || trip.Status == "active" {
		return gin.H{"allowed": true, "via": "guard", "message": "已开启实时守护，可安全使用轨迹导航"}
	}
	if trip.DisclaimerAcceptedAt != nil {
		return gin.H{"allowed": true, "via": "disclaimer", "message": "已签署免责协议"}
	}
	return gin.H{"allowed": false, "via": nil, "message": "使用轨迹前请开启实时守护，或阅读并签署免责协议"}
}

/** 从路线预计时长推导守护计划小时（天按约 8h 徒步日估算） */
func plannedHoursFromRoutePayload(rm map[string]any) int {
	if h := asInt(rm["planned_duration_hours"]); h > 0 && h <= 72 {
		return h
	}
	ed := strings.TrimSpace(str(rm["estimated_duration"]))
	if ed == "" {
		return 8
	}
	if strings.Contains(ed, "半天") {
		return 5
	}
	// 取文案中最大数字作为天数/小时粗估
	maxN := 0
	cur := 0
	hasDigit := false
	for _, r := range ed {
		if r >= '0' && r <= '9' {
			hasDigit = true
			cur = cur*10 + int(r-'0')
			continue
		}
		if hasDigit && cur > maxN {
			maxN = cur
		}
		cur = 0
		hasDigit = false
	}
	if hasDigit && cur > maxN {
		maxN = cur
	}
	if maxN <= 0 {
		return 8
	}
	if strings.Contains(ed, "天") {
		h := maxN * 8
		if h > 72 {
			h = 72
		}
		return h
	}
	if strings.Contains(ed, "小时") || strings.Contains(ed, "h") || strings.Contains(ed, "H") {
		if maxN > 72 {
			return 72
		}
		return maxN
	}
	if maxN <= 12 {
		return maxN
	}
	return 8
}

func itoa(n int) string {
	return strings.TrimSpace(strings.Replace(jsonNumber(n), ".0", "", 1))
}

func jsonNumber(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func (s *Server) listFavoriteMaps(uid string) []map[string]any {
	var favs []db.Favorite
	s.DB.Where("user_id = ?", uid).Find(&favs)
	out := make([]map[string]any, 0)
	season := domain.CurrentSeason(time.Now())
	for _, f := range favs {
		var route db.Route
		if err := s.DB.First(&route, "id = ?", f.RouteID).Error; err != nil {
			continue
		}
		var rm map[string]any
		_ = json.Unmarshal([]byte(route.Payload), &rm)
		en := domain.EnrichRoute(rm, season)
		en["favorited"] = true
		out = append(out, en)
	}
	return out
}

func (s *Server) favoritesList(c *gin.Context) {
	c.JSON(200, gin.H{"data": s.listFavoriteMaps(s.uid(c))})
}

func (s *Server) favoritesToggle(c *gin.Context) {
	var body struct {
		RouteID string `json:"route_id"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	var count int64
	s.DB.Model(&db.Favorite{}).Where("user_id = ? AND route_id = ?", uid, body.RouteID).Count(&count)
	if count > 0 {
		s.DB.Where("user_id = ? AND route_id = ?", uid, body.RouteID).Delete(&db.Favorite{})
		c.JSON(200, gin.H{"data": gin.H{"favorited": false, "route_id": body.RouteID}})
		return
	}
	s.DB.Create(&db.Favorite{UserID: uid, RouteID: body.RouteID, CreatedAt: time.Now()})
	c.JSON(200, gin.H{"data": gin.H{"favorited": true, "route_id": body.RouteID}})
}

func (s *Server) favoriteGet(c *gin.Context) {
	uid := s.uid(c)
	var count int64
	s.DB.Model(&db.Favorite{}).Where("user_id = ? AND route_id = ?", uid, c.Param("routeId")).Count(&count)
	c.JSON(200, gin.H{"data": gin.H{"route_id": c.Param("routeId"), "favorited": count > 0}})
}

func (s *Server) tripsByRoute(c *gin.Context) {
	uid := s.uid(c)
	var trip db.Trip
	err := s.DB.Where("user_id = ? AND route_id = ? AND status IN ?", uid, c.Param("routeId"), []string{"planned", "active"}).
		First(&trip).Error
	if err != nil {
		c.JSON(200, gin.H{"data": nil})
		return
	}
	c.JSON(200, gin.H{"data": tripBrief(&trip)})
}

func (s *Server) tripsChecklist(c *gin.Context) {
	var body struct {
		ItemID  string `json:"item_id"`
		Checked bool   `json:"checked"`
	}
	_ = c.BindJSON(&body)
	var trip db.Trip
	if err := s.DB.First(&trip, "id = ? AND user_id = ?", c.Param("id"), s.uid(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "行程不存在"})
		return
	}
	items := parseJSONArr(trip.ItemsJSON)
	for i := range items {
		if str(items[i]["id"]) == body.ItemID {
			items[i]["checked"] = body.Checked
		}
	}
	trip.ItemsJSON = mustJSON(items)
	s.DB.Save(&trip)
	c.JSON(200, gin.H{"data": tripBrief(&trip)})
}

func (s *Server) tripsDisclaimer(c *gin.Context) {
	var trip db.Trip
	if err := s.DB.First(&trip, "id = ? AND user_id = ?", c.Param("id"), s.uid(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "行程不存在"})
		return
	}
	now := time.Now()
	trip.DisclaimerAcceptedAt = &now
	s.DB.Save(&trip)
	c.JSON(200, gin.H{"data": tripBrief(&trip)})
}

func (s *Server) tripsTrackAccess(c *gin.Context) {
	var trip db.Trip
	if err := s.DB.First(&trip, "id = ? AND user_id = ?", c.Param("id"), s.uid(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "行程不存在"})
		return
	}
	var guard db.GuardSession
	active := s.DB.Where("user_id = ? AND status = ?", s.uid(c), "active").First(&guard).Error == nil
	c.JSON(200, gin.H{
		"data": canUseTrack(&trip, active),
		"disclaimer_accepted": trip.DisclaimerAcceptedAt != nil,
		"disclaimer_text": trackDisclaimer,
	})
}

func (s *Server) tripsComplete(c *gin.Context) {
	uid := s.uid(c)
	var trip db.Trip
	if err := s.DB.First(&trip, "id = ? AND user_id = ?", c.Param("id"), uid).Error; err != nil {
		c.JSON(404, gin.H{"error": "行程不存在"})
		return
	}
	var body struct {
		// abandoned=true：仅取消计划，不计入里程
		Abandoned bool `json:"abandoned"`
	}
	_ = c.BindJSON(&body)

	s.DB.Model(&db.GuardSession{}).Where("user_id = ? AND status IN ?", uid, []string{"active", "sos"}).Update("status", "completed")
	now := time.Now()

	stats := gin.H{}
	if !body.Abandoned {
		stats = s.recordOutingComplete(uid, trip.RouteID, &now)
	}

	s.DB.Delete(&trip)
	c.JSON(200, gin.H{"data": gin.H{
		"id": trip.ID, "route_id": trip.RouteID, "status": "completed",
		"completed_at": now.Format(time.RFC3339),
		"stats_applied": !body.Abandoned,
		"stats": stats,
	}})
}

/** 完赛累加：总次数 +1，总里程 += 路线距离，总爬升 += 路线爬升 */
func (s *Server) recordOutingComplete(uid, routeID string, at *time.Time) gin.H {
	when := time.Now()
	if at != nil {
		when = *at
	}
	var route db.Route
	distKm := 0.0
	elev := 0
	name := routeID
	if err := s.DB.First(&route, "id = ?", routeID).Error; err == nil {
		name = route.Name
		var payload map[string]any
		_ = json.Unmarshal([]byte(route.Payload), &payload)
		distKm = asFloat64(payload["distance"])
		elev = int(asFloat64(payload["elevation_gain"]) + 0.5)
	}

	// 可选：按本次步行进度折算里程（有 walk_session 时）
	progress := 1.0
	var walk db.WalkSession
	if err := s.DB.Where("user_id = ? AND route_id = ?", uid, routeID).
		Order("updated_at desc").First(&walk).Error; err == nil && walk.Progress > 0 {
		progress = walk.Progress
		if progress > 1 {
			progress = 1
		}
		if progress < 0.05 {
			progress = 0.05 // 至少记一点，避免误触完赛记 0
		}
	}
	addDist := round1(distKm * progress)
	addElev := int(float64(elev)*progress + 0.5)

	var user db.User
	if err := s.DB.First(&user, "id = ?", uid).Error; err != nil {
		return gin.H{}
	}
	user.TotalTrips++
	user.TotalDistance = round1(user.TotalDistance + addDist)
	user.TotalElev += addElev
	// 简易升级：每 50km 或每 5 次 +1 级，上限 20
	levelByDist := 1 + int(user.TotalDistance/50)
	levelByTrips := 1 + user.TotalTrips/5
	next := levelByDist
	if levelByTrips > next {
		next = levelByTrips
	}
	if next > 20 {
		next = 20
	}
	if next > user.Level {
		user.Level = next
	}
	user.UpdatedAt = when
	s.DB.Save(&user)

	s.DB.Create(&db.CompletedRoute{
		ID: "cr_" + uuid.NewString()[:10], UserID: uid, RouteID: routeID, RouteName: name,
		DistanceKm: addDist, ElevationGainM: addElev,
		DurationHours: float64(tripDurationHours(&walk)),
		CompletedAt: when,
	})

	return gin.H{
		"added_distance_km": addDist, "added_elevation_m": addElev,
		"progress": progress,
		"total_distance_km": user.TotalDistance, "total_trips": user.TotalTrips,
		"total_elevation_gain": user.TotalElev, "level": user.Level,
	}
}

func tripDurationHours(w *db.WalkSession) float64 {
	if w == nil || w.ID == "" {
		return 0
	}
	h := w.UpdatedAt.Sub(w.StartedAt).Hours()
	if h < 0 {
		return 0
	}
	return round1(h)
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}

func (s *Server) tripsDelete(c *gin.Context) {
	uid := s.uid(c)
	res := s.DB.Where("id = ? AND user_id = ?", c.Param("id"), uid).Delete(&db.Trip{})
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "行程不存在"})
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) tripsGet(c *gin.Context) {
	var trip db.Trip
	if err := s.DB.First(&trip, "id = ? AND user_id = ?", c.Param("id"), s.uid(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "行程不存在"})
		return
	}
	c.JSON(200, gin.H{"data": tripBrief(&trip)})
}

// --- me ---

func (s *Server) meProfile(c *gin.Context) {
	var u db.User
	if err := s.DB.First(&u, "id = ?", s.uid(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	var done []db.CompletedRoute
	s.DB.Where("user_id = ?", u.ID).Order("completed_at desc").Limit(20).Find(&done)
	completed := make([]gin.H, 0, len(done))
	for _, r := range done {
		completed = append(completed, gin.H{
			"route_id": r.RouteID, "route_name": r.RouteName,
			"distance_km": r.DistanceKm, "elevation_gain_m": r.ElevationGainM,
			"duration_hours": r.DurationHours,
			"completed_at": r.CompletedAt.Format("2006-01-02"),
		})
	}
	c.JSON(200, gin.H{"data": gin.H{
		"id": u.ID, "name": u.Name, "avatar_url": u.AvatarURL, "bio": u.Bio,
		"verified": u.Verified, "verified_label": u.VerifiedLabel, "level": u.Level,
		"total_distance_km": round1(u.TotalDistance), "total_trips": u.TotalTrips,
		"total_elevation_gain": u.TotalElev, "safety_score": u.SafetyScore,
		"badges": []gin.H{
			{"id": "b1", "name": "初识山途", "description": "完成注册", "icon": "🏔️", "earned": true},
			{"id": "b2", "name": "安全启程", "description": "首次开启守护", "icon": "🛡️", "earned": u.TotalTrips > 0},
			{"id": "b3", "name": "百里征途", "description": "累计里程 ≥100km", "icon": "🥾", "earned": u.TotalDistance >= 100},
		},
		"completed_routes": completed,
	}})
}

func (s *Server) mePatchProfile(c *gin.Context) {
	var body map[string]any
	_ = c.BindJSON(&body)
	var u db.User
	if err := s.DB.First(&u, "id = ?", s.uid(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	if v, ok := body["name"].(string); ok && strings.TrimSpace(v) != "" {
		u.Name = strings.TrimSpace(v)
	}
	if v, ok := body["bio"].(string); ok {
		u.Bio = v
	}
	if v, ok := body["avatar_url"].(string); ok && strings.TrimSpace(v) != "" {
		u.AvatarURL = strings.TrimSpace(v)
	}
	s.DB.Save(&u)
	s.meProfile(c)
}

func (s *Server) meVerify(c *gin.Context) {
	s.DB.Model(&db.User{}).Where("id = ?", s.uid(c)).Updates(map[string]any{
		"verified": true, "verified_label": "已实名",
	})
	s.meProfile(c)
}

func contactBrief(ct db.EmergencyContact) gin.H {
	return gin.H{
		"id": ct.ID, "name": ct.Name, "phone": ct.Phone,
		"is_primary": ct.IsPrimary,
		"created_at": ct.CreatedAt.Format(time.RFC3339),
	}
}

func (s *Server) listContactBriefs(uid string) []gin.H {
	var contacts []db.EmergencyContact
	s.DB.Where("user_id = ?", uid).Order("is_primary desc, created_at asc").Find(&contacts)
	out := make([]gin.H, 0, len(contacts))
	for _, ct := range contacts {
		out = append(out, contactBrief(ct))
	}
	return out
}

func settingsBrief(st db.SafetySettings) gin.H {
	hours := st.DepartureRemindHours
	if hours <= 0 {
		hours = 12
	}
	var deviceID any
	if st.SatelliteDeviceID != nil && *st.SatelliteDeviceID != "" {
		deviceID = *st.SatelliteDeviceID
	} else {
		deviceID = nil
	}
	return gin.H{
		"departure_remind_hours": hours,
		"remind_weather":         st.RemindWeather,
		"remind_checklist":       st.RemindChecklist,
		"remind_route_risk":      st.RemindRouteRisk,
		"satellite_bound":        st.SatelliteBound,
		"satellite_device_id":    deviceID,
	}
}

func (s *Server) ensureSafetySettings(uid string) db.SafetySettings {
	var st db.SafetySettings
	if err := s.DB.First(&st, "user_id = ?", uid).Error; err != nil {
		st = db.SafetySettings{
			UserID: uid, DepartureRemindHours: 12,
			RemindWeather: true, RemindChecklist: true, RemindRouteRisk: true,
		}
		s.DB.Create(&st)
	}
	return st
}

func (s *Server) meSafety(c *gin.Context) {
	uid := s.uid(c)
	contacts := s.listContactBriefs(uid)
	st := s.ensureSafetySettings(uid)
	settings := settingsBrief(st)

	var primary any
	for _, ct := range contacts {
		if v, _ := ct["is_primary"].(bool); v {
			primary = ct
			break
		}
	}
	if primary == nil && len(contacts) > 0 {
		primary = contacts[0]
	}

	weather := domain.DefaultWeather()
	if s.Weather != nil {
		weather = s.Weather.Brief()
	}
	alerts := []gin.H{}
	if weather.SuitableLabel != "适宜出行" {
		level := "warn"
		if weather.SuitableLabel == "不建议出行" {
			level = "danger"
		}
		alerts = append(alerts, gin.H{
			"level": level, "title": "出行提醒 · " + weather.SuitableLabel, "body": weather.Advice,
		})
	} else {
		alerts = append(alerts, gin.H{
			"level": "info", "title": "今日天气尚可",
			"body": weather.Condition + " " + itoa(weather.TempC) + "°C · " + weather.Advice,
		})
	}

	var tripOut any
	trip := s.currentTrip(uid)
	if trip != nil {
		var route db.Route
		name := trip.RouteID
		if s.DB.First(&route, "id = ?", trip.RouteID).Error == nil {
			name = route.Name
		}
		items := parseJSONArr(trip.ItemsJSON)
		progress := progressOf(items)
		if ready, _ := progress["essential_ready"].(bool); !ready {
			essTotal, _ := progress["essential_total"].(int)
			essDone, _ := progress["essential_done"].(int)
			// progress ints may be from gin.H as int
			if essTotal == 0 {
				if v, ok := progress["essential_total"].(float64); ok {
					essTotal = int(v)
				}
			}
			if essDone == 0 {
				if v, ok := progress["essential_done"].(float64); ok {
					essDone = int(v)
				}
			}
			gap := essTotal - essDone
			if gap < 0 {
				gap = 0
			}
			if essTotal > 0 && gap > 0 {
				alerts = append(alerts, gin.H{
					"level": "warn", "title": "行前清单未齐",
					"body": "「" + name + "」必带还差 " + itoa(gap) + " 件，建议出发前补齐",
				})
			}
		}
		tripOut = gin.H{
			"id": trip.ID, "route_id": trip.RouteID, "route_name": name,
			"departure_at": trip.DepartureAt.Format(time.RFC3339),
		}
	}

	var user db.User
	_ = s.DB.First(&user, "id = ?", uid)
	var deviceID any
	if st.SatelliteDeviceID != nil {
		deviceID = *st.SatelliteDeviceID
	}

	var latestSos any
	if st.LastSosJSON != "" {
		_ = json.Unmarshal([]byte(st.LastSosJSON), &latestSos)
	}

	c.JSON(200, gin.H{"data": gin.H{
		"profile": gin.H{
			"name": user.Name, "verified": user.Verified,
			"verified_label": user.VerifiedLabel, "safety_score": user.SafetyScore,
		},
		"contacts": contacts, "primary_contact": primary, "settings": settings,
		"alerts": alerts, "trip": tripOut, "latest_sos": latestSos,
		"satellite": gin.H{
			"bound": st.SatelliteBound, "device_id": deviceID,
			"note": "预留接口：可绑定北斗等卫星通信设备，无公网时发送短报文",
		},
		"notify_mode":    s.Cfg.NotifyMode,
		"has_active_trip": trip != nil, "sos_ready": len(contacts) > 0,
	}})
}

func (s *Server) meContacts(c *gin.Context) {
	c.JSON(200, gin.H{"data": s.listContactBriefs(s.uid(c))})
}

func (s *Server) meAddContact(c *gin.Context) {
	var body struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	_ = c.BindJSON(&body)
	name := strings.TrimSpace(body.Name)
	phone := strings.TrimSpace(body.Phone)
	if name == "" || phone == "" {
		c.JSON(400, gin.H{"error": "姓名与电话必填"})
		return
	}
	if len(phone) < 11 {
		c.JSON(400, gin.H{"error": "请输入正确的手机号"})
		return
	}
	uid := s.uid(c)
	var count int64
	s.DB.Model(&db.EmergencyContact{}).Where("user_id = ?", uid).Count(&count)
	if count >= 5 {
		c.JSON(400, gin.H{"error": "最多添加 5 位紧急联系人"})
		return
	}
	ct := db.EmergencyContact{
		ID: "ec_" + uuid.NewString()[:8], UserID: uid,
		Name: name, Phone: phone, IsPrimary: count == 0, CreatedAt: time.Now(),
	}
	s.DB.Create(&ct)
	c.JSON(200, gin.H{"data": contactBrief(ct)})
}

func (s *Server) meDelContact(c *gin.Context) {
	res := s.DB.Where("id = ? AND user_id = ?", c.Param("id"), s.uid(c)).Delete(&db.EmergencyContact{})
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "联系人不存在"})
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) mePrimaryContact(c *gin.Context) {
	uid := s.uid(c)
	s.DB.Model(&db.EmergencyContact{}).Where("user_id = ?", uid).Update("is_primary", false)
	s.DB.Model(&db.EmergencyContact{}).Where("id = ? AND user_id = ?", c.Param("id"), uid).Update("is_primary", true)
	var ct db.EmergencyContact
	if err := s.DB.First(&ct, "id = ? AND user_id = ?", c.Param("id"), uid).Error; err != nil {
		c.JSON(404, gin.H{"error": "联系人不存在"})
		return
	}
	c.JSON(200, gin.H{"data": contactBrief(ct)})
}

func (s *Server) meSafetySettings(c *gin.Context) {
	var body map[string]any
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	st := s.ensureSafetySettings(uid)
	if v, ok := body["departure_remind_hours"].(float64); ok {
		h := int(v)
		if h < 1 {
			h = 1
		}
		if h > 72 {
			h = 72
		}
		st.DepartureRemindHours = h
	}
	if v, ok := body["remind_weather"].(bool); ok {
		st.RemindWeather = v
	}
	if v, ok := body["remind_checklist"].(bool); ok {
		st.RemindChecklist = v
	}
	if v, ok := body["remind_route_risk"].(bool); ok {
		st.RemindRouteRisk = v
	}
	s.DB.Save(&st)
	c.JSON(200, gin.H{"data": settingsBrief(st)})
}

func (s *Server) meSatBind(c *gin.Context) {
	var body struct {
		DeviceID string `json:"device_id"`
	}
	_ = c.BindJSON(&body)
	id := strings.TrimSpace(body.DeviceID)
	s.DB.Model(&db.SafetySettings{}).Where("user_id = ?", s.uid(c)).Updates(map[string]any{
		"satellite_device_id": id, "satellite_bound": id != "",
	})
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "device_id": id}})
}

func (s *Server) meSatUnbind(c *gin.Context) {
	s.DB.Model(&db.SafetySettings{}).Where("user_id = ?", s.uid(c)).Updates(map[string]any{
		"satellite_device_id": nil, "satellite_bound": false,
	})
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

// --- community ---

func (s *Server) communityBoard(c *gin.Context) {
	focusRouteID := c.Query("route_id")
	uid := s.userIDFromHeader(c)

	var posts []db.Post
	s.DB.Order("created_at desc").Find(&posts)
	var leaders []db.Leader
	s.DB.Find(&leaders)

	routeNames := map[string]string{}
	var routes []db.Route
	s.DB.Find(&routes)
	for _, r := range routes {
		routeNames[r.ID] = r.Name
	}

	commentCounts := map[string]int{}
	var comments []db.Comment
	s.DB.Find(&comments)
	for _, cm := range comments {
		commentCounts[cm.PostID]++
	}

	postMaps := make([]map[string]any, 0, len(posts))
	for _, p := range posts {
		if p.Hidden {
			continue
		}
		var m map[string]any
		_ = json.Unmarshal([]byte(p.Payload), &m)
		if m == nil {
			continue
		}
		if str(m["type"]) == "" && p.Type != "" {
			m["type"] = p.Type
		}
		m["author"] = normalizeAuthor(m["author"])
		postMaps = append(postMaps, m)
	}
	leaderMaps := make([]map[string]any, 0, len(leaders))
	for _, l := range leaders {
		var m map[string]any
		_ = json.Unmarshal([]byte(l.Payload), &m)
		if m != nil {
			leaderMaps = append(leaderMaps, m)
		}
	}

	tripRouteID, tripID, tripRouteName := "", "", ""
	if cur := s.currentTrip(uid); cur != nil {
		tripRouteID, tripID = cur.RouteID, cur.ID
		tripRouteName = routeNames[cur.RouteID]
	}

	board := domain.BuildCommunityBoard(
		postMaps, leaderMaps, routeNames, commentCounts,
		focusRouteID, tripRouteID, tripID, tripRouteName,
	)
	viewer := s.userIDFromHeader(c)
	s.attachBoardLikeState(board, viewer)
	c.JSON(200, gin.H{"data": board})
}

func (s *Server) communitySearch(c *gin.Context) {
	q := strings.ToLower(c.Query("q"))
	var posts []db.Post
	s.DB.Find(&posts)
	routeNames := s.routeNameMap()
	commentCounts := s.postCommentCounts()
	out := make([]any, 0)
	for _, p := range posts {
		if p.Hidden {
			continue
		}
		var m map[string]any
		_ = json.Unmarshal([]byte(p.Payload), &m)
		if m == nil {
			continue
		}
		if str(m["type"]) == "" && p.Type != "" {
			m["type"] = p.Type
		}
		title := strings.ToLower(str(m["title"]))
		content := strings.ToLower(str(m["content"]))
		if q == "" || strings.Contains(title, q) || strings.Contains(content, q) {
			rid := str(m["route_id"])
			out = append(out, domain.EnrichCommunityPost(m, routeNames[rid], commentCounts[p.ID]))
		}
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) communityPosts(c *gin.Context) {
	s.communitySearch(c)
}

func (s *Server) communityCreatePost(c *gin.Context) {
	var body map[string]any
	_ = c.BindJSON(&body)
	id := "p_" + uuid.NewString()[:8]
	body["id"] = id
	body["created_at"] = time.Now().Format(time.RFC3339)
	if body["author"] == nil {
		var u db.User
		_ = s.DB.First(&u, "id = ?", s.uid(c))
		body["author"] = gin.H{"name": u.Name, "avatar_url": u.AvatarURL, "level": u.Level, "is_certified_leader": false}
	}
	typ := str(body["type"])
	if typ == "" {
		typ = "guide"
	}
	body["type"] = typ
	var routeID *string
	if r := str(body["route_id"]); r != "" {
		routeID = &r
	}
	s.DB.Create(&db.Post{
		ID: id, UserID: s.uid(c), Payload: mustJSON(body), Type: typ, RouteID: routeID, CreatedAt: time.Now(),
	})
	routeNames := s.routeNameMap()
	enriched := domain.EnrichCommunityPost(body, routeNames[str(body["route_id"])], 0)
	c.JSON(200, gin.H{"data": enriched})
}

func (s *Server) communityPostDetail(c *gin.Context) {
	var p db.Post
	if err := s.DB.First(&p, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	if p.Hidden {
		c.JSON(404, gin.H{"error": "帖子不存在或已下架"})
		return
	}
	var m map[string]any
	_ = json.Unmarshal([]byte(p.Payload), &m)
	if m == nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	if str(m["type"]) == "" && p.Type != "" {
		m["type"] = p.Type
	}
	m["author"] = normalizeAuthor(m["author"])
	var comments int64
	s.DB.Model(&db.Comment{}).Where("post_id = ?", p.ID).Count(&comments)
	routeNames := s.routeNameMap()
	enriched := domain.EnrichCommunityPost(m, routeNames[str(m["route_id"])], int(comments))
	viewer := s.userIDFromHeader(c)
	s.attachPostLikeState(enriched, p.ID, viewer)
	enriched["interest_count"] = s.companionInterestCount(p.ID)
	joined := false
	if viewer != "" {
		var n int64
		s.DB.Model(&db.CompanionInterest{}).Where("user_id = ? AND post_id = ?", viewer, p.ID).Count(&n)
		joined = n > 0
	}
	enriched["joined_by_me"] = joined
	enriched["is_owner"] = viewer != "" && p.UserID == viewer
	c.JSON(200, gin.H{"data": enriched})
}

func (s *Server) routeNameMap() map[string]string {
	var routes []db.Route
	s.DB.Find(&routes)
	routeNames := map[string]string{}
	for _, r := range routes {
		routeNames[r.ID] = r.Name
	}
	return routeNames
}

func (s *Server) postCommentCounts() map[string]int {
	commentCounts := map[string]int{}
	var comments []db.Comment
	s.DB.Find(&comments)
	for _, cm := range comments {
		commentCounts[cm.PostID]++
	}
	return commentCounts
}

func (s *Server) communityComments(c *gin.Context) {
	postID := c.Param("id")
	var p db.Post
	if err := s.DB.First(&p, "id = ?", postID).Error; err != nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	viewer := s.userIDFromHeader(c)
	c.JSON(200, gin.H{"data": s.commentTree(postID, viewer)})
}

func (s *Server) communityAddComment(c *gin.Context) {
	postID := c.Param("id")
	uid := s.uid(c)
	var p db.Post
	if err := s.DB.First(&p, "id = ?", postID).Error; err != nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	var body struct {
		Content  string  `json:"content"`
		ParentID *string `json:"parent_id"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "请求格式错误"})
		return
	}
	text := strings.TrimSpace(body.Content)
	if text == "" {
		c.JSON(400, gin.H{"error": "请输入评论内容"})
		return
	}
	if len([]rune(text)) > 500 {
		c.JSON(400, gin.H{"error": "评论请控制在 500 字以内"})
		return
	}

	var u db.User
	if err := s.DB.First(&u, "id = ?", uid).Error; err != nil {
		c.JSON(401, gin.H{"error": "请先登录"})
		return
	}

	parentID := ""
	var parentMap map[string]any
	if body.ParentID != nil {
		parentID = strings.TrimSpace(*body.ParentID)
	}
	if parentID != "" {
		var parent db.Comment
		if err := s.DB.First(&parent, "id = ? AND post_id = ?", parentID, postID).Error; err != nil {
			c.JSON(400, gin.H{"error": "回复的评论不存在"})
			return
		}
		_ = json.Unmarshal([]byte(parent.Payload), &parentMap)
		if parentMap == nil {
			parentMap = map[string]any{}
		}
		if pid := str(parentMap["parent_id"]); pid != "" {
			parentID = pid
			var root db.Comment
			if err := s.DB.First(&root, "id = ? AND post_id = ?", parentID, postID).Error; err == nil {
				parent = root
				_ = json.Unmarshal([]byte(parent.Payload), &parentMap)
				if parentMap == nil {
					parentMap = map[string]any{}
				}
			}
		}
		parentUID := parent.UserID
		if parentUID == "" {
			parentUID = str(parentMap["user_id"])
		}
		if parentUID != "" && parentUID == uid {
			c.JSON(400, gin.H{"error": "不能回复自己的评论"})
			return
		}
		if parentUID == "" {
			pa := normalizeAuthor(parentMap["author"])
			if str(pa["name"]) != "" && str(pa["name"]) == u.Name {
				c.JSON(400, gin.H{"error": "不能回复自己的评论"})
				return
			}
		}
	}

	isLeader := u.Verified || u.Level >= 8
	id := "cm_" + uuid.NewString()[:8]
	item := map[string]any{
		"id":      id,
		"post_id": postID,
		"user_id": uid,
		"parent_id": func() any {
			if parentID == "" {
				return nil
			}
			return parentID
		}(),
		"content": text,
		"author": gin.H{
			"name":                u.Name,
			"avatar_url":          u.AvatarURL,
			"level":               u.Level,
			"is_certified_leader": isLeader,
		},
		"created_at": time.Now().Format(time.RFC3339),
		"likes":      0,
	}
	s.DB.Create(&db.Comment{
		ID: id, PostID: postID, UserID: uid, Payload: mustJSON(item), CreatedAt: time.Now(),
	})

	var postMap map[string]any
	_ = json.Unmarshal([]byte(p.Payload), &postMap)
	if postMap == nil {
		postMap = map[string]any{}
	}
	kind := s.postDisplayKind(p, postMap)
	snippet := text
	if rs := []rune(snippet); len(rs) > 40 {
		snippet = string(rs[:40]) + "…"
	}

	if parentID != "" && parentMap != nil {
		targetUID := ""
		var parentRow db.Comment
		if err := s.DB.First(&parentRow, "id = ?", parentID).Error; err == nil {
			targetUID = parentRow.UserID
		}
		if targetUID == "" {
			targetUID = str(parentMap["user_id"])
		}
		if targetUID != "" && targetUID != uid {
			s.createNotification(db.AppNotification{
				ID: "n_" + uuid.NewString()[:10], UserID: targetUID, ActorID: uid, ActorName: u.Name,
				Type: "comment_reply", Title: u.Name + " 回复了你", Body: snippet,
				PostID: postID, CommentID: id, Read: false, CreatedAt: time.Now(),
			})
		}
	} else if p.UserID != "" && p.UserID != uid {
		title, body, nType := postCommentNotif(u.Name, kind, snippet, isLeader)
		s.createNotification(db.AppNotification{
			ID: "n_" + uuid.NewString()[:10], UserID: p.UserID, ActorID: uid, ActorName: u.Name,
			Type: nType, Title: title, Body: body,
			PostID: postID, CommentID: id, Read: false, CreatedAt: time.Now(),
		})
		// 求助：领队首次回复 → 标记 has_leader_reply
		if kind == "question" && isLeader && !asBoolMap(postMap["has_leader_reply"]) {
			postMap["has_leader_reply"] = true
			postMap["answered"] = true
			p.Payload = mustJSON(postMap)
			s.DB.Model(&p).Update("payload", p.Payload)
		}
	}

	count := s.countComments(postID)
	c.JSON(200, gin.H{
		"data":           item,
		"tree":           s.commentTree(postID, uid),
		"comments_count": count,
	})
}

func asBoolMap(v any) bool {
	b, _ := v.(bool)
	return b
}

func (s *Server) postDisplayKind(p db.Post, payload map[string]any) string {
	if payload != nil {
		if d := str(payload["display_type"]); d != "" {
			return d
		}
		if t := str(payload["type"]); t != "" {
			return domain.MapDisplayType(payload)
		}
	}
	if p.Type != "" {
		return domain.MapDisplayType(map[string]any{"type": p.Type, "title": str(payload["title"]), "content": str(payload["content"]), "created_at": str(payload["created_at"])})
	}
	return "review"
}

func postCommentNotif(actor, kind, snippet string, isLeader bool) (title, body, nType string) {
	nType = "post_comment"
	switch kind {
	case "companion":
		title = actor + " 回应了你的约伴"
		body = snippet
		nType = "companion_comment"
	case "question":
		if isLeader {
			title = actor + "（领队）回答了你的求助"
			body = snippet
			nType = "question_leader_reply"
		} else {
			title = actor + " 回答了你的求助"
			body = snippet
		}
	case "guide":
		title = actor + " 评论了你的攻略"
		body = snippet
	case "condition":
		title = actor + " 评论了你的路况"
		body = snippet
	default:
		title = actor + " 评论了你的帖子"
		body = snippet
	}
	return
}

func (s *Server) communityCompanionJoin(c *gin.Context) {
	uid := s.userIDFromHeader(c)
	if uid == "" {
		c.JSON(401, gin.H{"error": "请先登录"})
		return
	}
	postID := c.Param("id")
	var p db.Post
	if err := s.DB.First(&p, "id = ?", postID).Error; err != nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	var payload map[string]any
	_ = json.Unmarshal([]byte(p.Payload), &payload)
	if payload == nil {
		payload = map[string]any{}
	}
	kind := s.postDisplayKind(p, payload)
	if kind != "companion" && str(payload["type"]) != "companion" {
		c.JSON(400, gin.H{"error": "仅约伴帖可报名加入"})
		return
	}
	if p.UserID == uid {
		c.JSON(400, gin.H{"error": "不能加入自己的约伴"})
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = c.BindJSON(&body)
	note := strings.TrimSpace(body.Note)
	if note == "" {
		note = "想加入，请联系我"
	}
	if len([]rune(note)) > 200 {
		c.JSON(400, gin.H{"error": "留言请控制在 200 字以内"})
		return
	}
	var exist db.CompanionInterest
	if s.DB.First(&exist, "user_id = ? AND post_id = ?", uid, postID).Error == nil {
		c.JSON(200, gin.H{"data": gin.H{"joined": true, "already": true, "interest_count": s.companionInterestCount(postID)}})
		return
	}
	s.DB.Create(&db.CompanionInterest{UserID: uid, PostID: postID, Note: note, CreatedAt: time.Now()})
	// 空位 -1（若有 seats）
	if meta, ok := payload["companion_meta"].(map[string]any); ok {
		seats := int(asFloatAny(meta["seats"]))
		if seats > 0 {
			meta["seats"] = seats - 1
			payload["companion_meta"] = meta
			p.Payload = mustJSON(payload)
			s.DB.Model(&p).Update("payload", p.Payload)
		}
	}
	var actor db.User
	_ = s.DB.First(&actor, "id = ?", uid)
	if p.UserID != "" && p.UserID != uid {
		s.createNotification(db.AppNotification{
			ID: "n_" + uuid.NewString()[:10], UserID: p.UserID, ActorID: uid, ActorName: actor.Name,
			Type: "companion_join", Title: actor.Name + " 想加入你的约伴", Body: note,
			PostID: postID, CommentID: "", Read: false, CreatedAt: time.Now(),
		})
	}
	c.JSON(200, gin.H{"data": gin.H{
		"joined": true, "already": false, "interest_count": s.companionInterestCount(postID),
		"companion_meta": payload["companion_meta"],
	}})
}

func (s *Server) companionInterestCount(postID string) int {
	var n int64
	s.DB.Model(&db.CompanionInterest{}).Where("post_id = ?", postID).Count(&n)
	return int(n)
}

func (s *Server) communityMarkAnswered(c *gin.Context) {
	uid := s.userIDFromHeader(c)
	if uid == "" {
		c.JSON(401, gin.H{"error": "请先登录"})
		return
	}
	postID := c.Param("id")
	var p db.Post
	if err := s.DB.First(&p, "id = ?", postID).Error; err != nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	if p.UserID != uid {
		c.JSON(403, gin.H{"error": "仅楼主可标记已解答"})
		return
	}
	var payload map[string]any
	_ = json.Unmarshal([]byte(p.Payload), &payload)
	if payload == nil {
		payload = map[string]any{}
	}
	kind := s.postDisplayKind(p, payload)
	if kind != "question" && str(payload["type"]) != "question" {
		c.JSON(400, gin.H{"error": "仅求助帖可标记已解答"})
		return
	}
	payload["answered"] = true
	p.Payload = mustJSON(payload)
	s.DB.Model(&p).Update("payload", p.Payload)
	routeNames := s.routeNameMap()
	var comments int64
	s.DB.Model(&db.Comment{}).Where("post_id = ?", p.ID).Count(&comments)
	enriched := domain.EnrichCommunityPost(payload, routeNames[str(payload["route_id"])], int(comments))
	s.attachPostLikeState(enriched, p.ID, uid)
	enriched["interest_count"] = s.companionInterestCount(p.ID)
	enriched["joined_by_me"] = false
	c.JSON(200, gin.H{"data": enriched})
}

func (s *Server) createNotification(n db.AppNotification) {
	_ = s.DB.Create(&n).Error
}

func (s *Server) meNotifications(c *gin.Context) {
	uid := s.uid(c)
	var rows []db.AppNotification
	s.DB.Where("user_id = ?", uid).Order("created_at desc").Limit(100).Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, n := range rows {
		out = append(out, gin.H{
			"id": n.ID, "type": n.Type, "title": n.Title, "body": n.Body,
			"actor_id": n.ActorID, "actor_name": n.ActorName,
			"post_id": n.PostID, "comment_id": n.CommentID,
			"read": n.Read, "created_at": n.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(200, gin.H{"data": out})
}

func (s *Server) meNotificationsUnread(c *gin.Context) {
	var n int64
	s.DB.Model(&db.AppNotification{}).Where("user_id = ? AND read = ?", s.uid(c), false).Count(&n)
	c.JSON(200, gin.H{"data": gin.H{"count": n}})
}

func (s *Server) meNotificationsReadAll(c *gin.Context) {
	s.DB.Model(&db.AppNotification{}).Where("user_id = ? AND read = ?", s.uid(c), false).Update("read", true)
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) meNotificationRead(c *gin.Context) {
	s.DB.Model(&db.AppNotification{}).
		Where("id = ? AND user_id = ?", c.Param("id"), s.uid(c)).
		Update("read", true)
	c.JSON(200, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) meCommunityNewCount(c *gin.Context) {
	uid := s.uid(c)
	if s.userIDFromHeader(c) == "" {
		c.JSON(200, gin.H{"data": gin.H{"count": 0}})
		return
	}
	var u db.User
	if err := s.DB.First(&u, "id = ?", uid).Error; err != nil {
		c.JSON(200, gin.H{"data": gin.H{"count": 0}})
		return
	}
	// 首次：初始化已读游标，不刷历史红点
	if u.CommunitySeenAt == nil {
		now := time.Now()
		s.DB.Model(&u).Update("community_seen_at", now)
		c.JSON(200, gin.H{"data": gin.H{"count": 0}})
		return
	}
	var n int64
	s.DB.Model(&db.Post{}).
		Where("created_at > ? AND (user_id = '' OR user_id IS NULL OR user_id != ?)", *u.CommunitySeenAt, uid).
		Count(&n)
	c.JSON(200, gin.H{"data": gin.H{"count": n}})
}

func (s *Server) meCommunitySeen(c *gin.Context) {
	uid := s.uid(c)
	if s.userIDFromHeader(c) == "" {
		c.JSON(200, gin.H{"data": gin.H{"ok": true}})
		return
	}
	now := time.Now()
	s.DB.Model(&db.User{}).Where("id = ?", uid).Update("community_seen_at", now)
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "seen_at": now.Format(time.RFC3339)}})
}

func (s *Server) loadCommentMaps(postID string) []map[string]any {
	var rows []db.Comment
	s.DB.Where("post_id = ?", postID).Order("created_at asc").Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		_ = json.Unmarshal([]byte(r.Payload), &m)
		if m == nil {
			continue
		}
		if str(m["id"]) == "" {
			m["id"] = r.ID
		}
		if str(m["post_id"]) == "" {
			m["post_id"] = r.PostID
		}
		if r.UserID != "" {
			m["user_id"] = r.UserID
		}
		m["author"] = normalizeAuthor(m["author"])
		out = append(out, m)
	}
	return out
}

func (s *Server) countComments(postID string) int {
	var n int64
	s.DB.Model(&db.Comment{}).Where("post_id = ?", postID).Count(&n)
	return int(n)
}

func (s *Server) commentTree(postID, viewer string) []map[string]any {
	all := s.loadCommentMaps(postID)
	liked := map[string]bool{}
	if viewer != "" {
		ids := make([]string, 0, len(all))
		for _, m := range all {
			ids = append(ids, str(m["id"]))
		}
		if len(ids) > 0 {
			var rows []db.CommentLike
			s.DB.Where("user_id = ? AND comment_id IN ?", viewer, ids).Find(&rows)
			for _, r := range rows {
				liked[r.CommentID] = true
			}
		}
	}
	byParent := map[string][]map[string]any{}
	roots := make([]map[string]any, 0)
	for _, m := range all {
		cid := str(m["id"])
		m["liked_by_me"] = liked[cid]
		if _, ok := m["likes"]; !ok {
			m["likes"] = 0
		}
		pid := str(m["parent_id"])
		if pid == "" {
			roots = append(roots, m)
			continue
		}
		byParent[pid] = append(byParent[pid], m)
	}
	tree := make([]map[string]any, 0, len(roots))
	for _, root := range roots {
		replies := byParent[str(root["id"])]
		if replies == nil {
			replies = []map[string]any{}
		}
		root["replies"] = replies
		tree = append(tree, root)
	}
	return tree
}

func (s *Server) attachPostLikeState(post map[string]any, postID, viewer string) {
	if post == nil {
		return
	}
	if _, ok := post["likes"]; !ok {
		post["likes"] = 0
	}
	liked := false
	if viewer != "" {
		var n int64
		s.DB.Model(&db.PostLike{}).Where("user_id = ? AND post_id = ?", viewer, postID).Count(&n)
		liked = n > 0
	}
	post["liked_by_me"] = liked
}

func (s *Server) attachBoardLikeState(board map[string]any, viewer string) {
	if board == nil {
		return
	}
	likedSet := map[string]bool{}
	if viewer != "" {
		var rows []db.PostLike
		s.DB.Where("user_id = ?", viewer).Find(&rows)
		for _, r := range rows {
			likedSet[r.PostID] = true
		}
	}
	for _, key := range []string{"conditions", "guides", "companions", "open_questions", "trip_related"} {
		arr, _ := board[key].([]map[string]any)
		if arr == nil {
			// BuildCommunityBoard may return []any
			raw, _ := board[key].([]any)
			for i := range raw {
				if m, ok := raw[i].(map[string]any); ok {
					pid := str(m["id"])
					m["liked_by_me"] = likedSet[pid]
					if _, ok := m["likes"]; !ok {
						m["likes"] = 0
					}
				}
			}
			continue
		}
		for _, m := range arr {
			pid := str(m["id"])
			m["liked_by_me"] = likedSet[pid]
			if _, ok := m["likes"]; !ok {
				m["likes"] = 0
			}
		}
	}
}

func (s *Server) communityTogglePostLike(c *gin.Context) {
	uid := s.uid(c)
	if uid == "" {
		c.JSON(401, gin.H{"error": "请先登录"})
		return
	}
	postID := c.Param("id")
	var p db.Post
	if err := s.DB.First(&p, "id = ?", postID).Error; err != nil {
		c.JSON(404, gin.H{"error": "帖子不存在"})
		return
	}
	var existing db.PostLike
	err := s.DB.First(&existing, "user_id = ? AND post_id = ?", uid, postID).Error
	liked := false
	if err == nil {
		s.DB.Delete(&existing)
		liked = false
	} else {
		s.DB.Create(&db.PostLike{UserID: uid, PostID: postID, CreatedAt: time.Now()})
		liked = true
	}
	likes := s.bumpPostLikes(&p, liked)
	if liked {
		s.notifyPostLike(uid, &p)
	}
	c.JSON(200, gin.H{"data": gin.H{"liked": liked, "likes": likes, "post_id": postID}})
}

func (s *Server) notifyPostLike(actorID string, p *db.Post) {
	target := p.UserID
	if target == "" {
		var m map[string]any
		_ = json.Unmarshal([]byte(p.Payload), &m)
		if author, ok := m["author"].(map[string]any); ok {
			target = str(author["user_id"])
		}
		if target == "" {
			target = str(m["user_id"])
		}
	}
	if target == "" || target == actorID {
		return
	}
	var actor db.User
	_ = s.DB.First(&actor, "id = ?", actorID)
	name := actor.Name
	if name == "" {
		name = "山途旅人"
	}
	titleSnippet := ""
	var m map[string]any
	_ = json.Unmarshal([]byte(p.Payload), &m)
	if m != nil {
		titleSnippet = str(m["title"])
		if rs := []rune(titleSnippet); len(rs) > 24 {
			titleSnippet = string(rs[:24]) + "…"
		}
	}
	body := "赞了你的帖子"
	if titleSnippet != "" {
		body = "赞了你的帖子「" + titleSnippet + "」"
	}
	s.createNotification(db.AppNotification{
		ID:        "n_" + uuid.NewString()[:10],
		UserID:    target,
		ActorID:   actorID,
		ActorName: name,
		Type:      "post_like",
		Title:     name + " 赞了你",
		Body:      body,
		PostID:    p.ID,
		CommentID: "",
		Read:      false,
		CreatedAt: time.Now(),
	})
}

func (s *Server) bumpPostLikes(p *db.Post, liked bool) int {
	var m map[string]any
	_ = json.Unmarshal([]byte(p.Payload), &m)
	if m == nil {
		m = map[string]any{}
	}
	cur := int(asFloatAny(m["likes"]))
	if liked {
		cur++
	} else if cur > 0 {
		cur--
	}
	m["likes"] = cur
	p.Payload = mustJSON(m)
	s.DB.Model(p).Update("payload", p.Payload)
	return cur
}

func (s *Server) communityToggleCommentLike(c *gin.Context) {
	uid := s.userIDFromHeader(c)
	if uid == "" {
		c.JSON(401, gin.H{"error": "请先登录"})
		return
	}
	commentID := c.Param("id")
	var cm db.Comment
	if err := s.DB.First(&cm, "id = ?", commentID).Error; err != nil {
		c.JSON(404, gin.H{"error": "评论不存在"})
		return
	}
	var existing db.CommentLike
	err := s.DB.First(&existing, "user_id = ? AND comment_id = ?", uid, commentID).Error
	liked := false
	if err == nil {
		s.DB.Delete(&existing)
		liked = false
	} else {
		s.DB.Create(&db.CommentLike{UserID: uid, CommentID: commentID, CreatedAt: time.Now()})
		liked = true
	}
	var m map[string]any
	_ = json.Unmarshal([]byte(cm.Payload), &m)
	if m == nil {
		m = map[string]any{}
	}
	cur := int(asFloatAny(m["likes"]))
	if liked {
		cur++
	} else if cur > 0 {
		cur--
	}
	m["likes"] = cur
	cm.Payload = mustJSON(m)
	s.DB.Model(&cm).Update("payload", cm.Payload)
	if liked {
		s.notifyCommentLike(uid, &cm, m)
	}
	c.JSON(200, gin.H{"data": gin.H{
		"liked": liked, "likes": cur, "comment_id": commentID, "post_id": cm.PostID,
	}})
}

func (s *Server) notifyCommentLike(actorID string, cm *db.Comment, payload map[string]any) {
	target := cm.UserID
	if target == "" && payload != nil {
		target = str(payload["user_id"])
	}
	if target == "" || target == actorID {
		return
	}
	var actor db.User
	_ = s.DB.First(&actor, "id = ?", actorID)
	name := actor.Name
	if name == "" {
		name = "山途旅人"
	}
	snippet := ""
	if payload != nil {
		snippet = str(payload["content"])
		if rs := []rune(snippet); len(rs) > 40 {
			snippet = string(rs[:40]) + "…"
		}
	}
	body := "赞了你的评论"
	if snippet != "" {
		body = "赞了你的评论：" + snippet
	}
	s.createNotification(db.AppNotification{
		ID:        "n_" + uuid.NewString()[:10],
		UserID:    target,
		ActorID:   actorID,
		ActorName: name,
		Type:      "comment_like",
		Title:     name + " 赞了你",
		Body:      body,
		PostID:    cm.PostID,
		CommentID: cm.ID,
		Read:      false,
		CreatedAt: time.Now(),
	})
}

func asFloatAny(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}

func (s *Server) communityLeaders(c *gin.Context) {
	var leaders []db.Leader
	s.DB.Find(&leaders)
	out := make([]any, 0)
	for _, l := range leaders {
		var m any
		_ = json.Unmarshal([]byte(l.Payload), &m)
		out = append(out, m)
	}
	c.JSON(200, gin.H{"data": out})
}

// --- guard ---

func (s *Server) guardStart(c *gin.Context) {
	var body struct {
		RouteID              string   `json:"route_id"`
		TripID               string   `json:"trip_id"`
		PlannedDurationHours int      `json:"planned_duration_hours"`
		Guardians            []string `json:"guardians"`
		Lat                  float64  `json:"lat"`
		Lng                  float64  `json:"lng"`
		Accuracy             *float64 `json:"accuracy"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	s.DB.Model(&db.GuardSession{}).Where("user_id = ? AND status = ?", uid, "active").Update("status", "completed")
	id := "guard_" + uuid.NewString()[:10]
	var tripID *string
	if body.TripID != "" {
		tripID = &body.TripID
	}
	hours := body.PlannedDurationHours
	if hours <= 0 {
		hours = 8
		if cur := s.currentTrip(uid); cur != nil && cur.PlannedDurationHours > 0 {
			hours = cur.PlannedDurationHours
		} else if body.RouteID != "" {
			var route db.Route
			if s.DB.First(&route, "id = ?", body.RouteID).Error == nil {
				var rm map[string]any
				_ = json.Unmarshal([]byte(route.Payload), &rm)
				hours = plannedHoursFromRoutePayload(rm)
			}
		}
	}
	guardians := body.Guardians
	if len(guardians) == 0 {
		guardians = s.contactGuardianNames(uid)
	}
	if len(guardians) == 0 {
		c.JSON(400, gin.H{"error": "开启守护前请先在安全中心添加紧急联系人", "code": "need_contacts"})
		return
	}
	loc := gin.H{"timestamp": time.Now().Format(time.RFC3339), "fix": "pending"}
	hasFix := body.Accuracy != nil || body.Lat != 0 || body.Lng != 0
	if hasFix {
		loc["lat"] = body.Lat
		loc["lng"] = body.Lng
		loc["fix"] = "gps"
		delete(loc, "note")
		if body.Accuracy != nil {
			loc["accuracy"] = *body.Accuracy
		}
	} else {
		loc["note"] = "等待首次 GPS 上报，未使用默认天气坐标"
	}
	gs := db.GuardSession{
		ID: id, UserID: uid, RouteID: body.RouteID, TripID: tripID, Status: "active",
		StartedAt: time.Now(), PlannedDurationHours: hours,
		GuardiansJSON:    mustJSON(guardians),
		LastLocationJSON: mustJSON(loc),
	}
	s.DB.Create(&gs)
	if body.TripID != "" {
		s.DB.Model(&db.Trip{}).Where("id = ?", body.TripID).Updates(map[string]any{
			"status": "active", "guard_session_id": id, "guardians_json": mustJSON(guardians),
		})
	}
	c.JSON(200, gin.H{"data": gin.H{
		"id": id, "user_id": uid, "route_id": body.RouteID, "trip_id": body.TripID,
		"status": "active", "started_at": gs.StartedAt.Format(time.RFC3339),
		"planned_duration_hours": hours, "guardians": guardians,
		"contacts_ready": len(guardians) > 0,
		"last_location": loc,
	}})
}

func (s *Server) guardSos(c *gin.Context) {
	s.guardSosNotify(c)
}

func (s *Server) meSos(c *gin.Context) {
	s.meSosNotify(c)
}

func (s *Server) guardStop(c *gin.Context) {
	uid := s.uid(c)
	var body struct {
		CompleteTrip *bool `json:"complete_trip"`
		Abandoned    bool  `json:"abandoned"`
	}
	_ = c.BindJSON(&body)
	countStats := true
	if body.CompleteTrip != nil {
		countStats = *body.CompleteTrip
	}
	if body.Abandoned {
		countStats = false
	}

	var gs db.GuardSession
	if err := s.DB.Where("user_id = ? AND status IN ?", uid, []string{"active", "sos"}).First(&gs).Error; err == nil {
		gs.Status = "completed"
		s.DB.Save(&gs)
		// 仅 complete_trip=true 时完结并移除行程；否则只结束守护，保留行程看板
		if gs.TripID != nil && countStats {
			var trip db.Trip
			if s.DB.First(&trip, "id = ?", *gs.TripID).Error == nil {
				s.recordOutingComplete(uid, trip.RouteID, nil)
				s.DB.Delete(&trip)
			}
		}
	}
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "stats_applied": countStats}})
}

func (s *Server) guardCheckin(c *gin.Context) {
	var body struct {
		SessionID string   `json:"session_id"`
		Lat       float64  `json:"lat"`
		Lng       float64  `json:"lng"`
		Accuracy  *float64 `json:"accuracy"`
		Altitude  *float64 `json:"altitude"`
		Progress  *float64 `json:"progress"`
		Timestamp string   `json:"timestamp"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	ts := body.Timestamp
	if ts == "" {
		ts = time.Now().Format(time.RFC3339)
	}
	loc := gin.H{"lat": body.Lat, "lng": body.Lng, "timestamp": ts}
	if body.Accuracy != nil {
		loc["accuracy"] = *body.Accuracy
	}
	if body.Altitude != nil {
		loc["altitude"] = *body.Altitude
	}
	if body.Progress != nil {
		loc["progress"] = *body.Progress
	}
	q := s.DB.Model(&db.GuardSession{}).Where("user_id = ? AND status IN ?", uid, []string{"active", "sos"})
	if body.SessionID != "" {
		q = q.Where("id = ?", body.SessionID)
	}
	res := q.Update("last_location_json", mustJSON(loc))
	c.JSON(200, gin.H{"data": gin.H{"ok": res.RowsAffected > 0, "last_location": loc}})
}

func (s *Server) guardStatus(c *gin.Context) {
	var gs db.GuardSession
	if err := s.DB.Where("user_id = ? AND status IN ?", s.uid(c), []string{"active", "sos"}).First(&gs).Error; err != nil {
		c.JSON(200, gin.H{"data": nil})
		return
	}
	var loc any
	_ = json.Unmarshal([]byte(gs.LastLocationJSON), &loc)
	var guardians []string
	_ = json.Unmarshal([]byte(gs.GuardiansJSON), &guardians)
	if guardians == nil {
		guardians = []string{}
	}
	tripID := ""
	if gs.TripID != nil {
		tripID = *gs.TripID
	}
	c.JSON(200, gin.H{"data": gin.H{
		"id": gs.ID, "route_id": gs.RouteID, "trip_id": tripID, "status": gs.Status,
		"started_at": gs.StartedAt.Format(time.RFC3339),
		"planned_duration_hours": gs.PlannedDurationHours,
		"guardians": guardians, "contacts_ready": len(guardians) > 0,
		"last_location": loc,
		"overtime_notified": gs.OvertimeNotifiedAt != nil,
		"overtime": gs.PlannedDurationHours > 0 && time.Since(gs.StartedAt) > time.Duration(gs.PlannedDurationHours)*time.Hour,
	}})
}

func (s *Server) guardOvertime(c *gin.Context) {
	var body struct {
		SessionID string `json:"session_id"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	var gs db.GuardSession
	q := s.DB.Where("user_id = ? AND status IN ?", uid, []string{"active", "sos"})
	if body.SessionID != "" {
		q = q.Where("id = ?", body.SessionID)
	}
	if err := q.First(&gs).Error; err != nil {
		c.JSON(404, gin.H{"error": "无进行中的守护"})
		return
	}
	planned := gs.PlannedDurationHours
	if planned <= 0 {
		planned = 8
	}
	if time.Since(gs.StartedAt) < time.Duration(planned)*time.Hour {
		c.JSON(200, gin.H{"data": gin.H{"ok": true, "overtime": false, "notified": false}})
		return
	}
	if gs.OvertimeNotifiedAt != nil {
		c.JSON(200, gin.H{"data": gin.H{
			"ok": true, "overtime": true, "already": true, "notified": true,
			"message": "此前已发送超时提醒",
		}})
		return
	}
	var user db.User
	_ = s.DB.First(&user, "id = ?", uid)
	var contacts []db.EmergencyContact
	s.DB.Where("user_id = ?", uid).Order("is_primary desc").Find(&contacts)
	ns := make([]notify.Contact, 0, len(contacts))
	for _, ct := range contacts {
		ns = append(ns, notify.Contact{Name: ct.Name, Phone: ct.Phone})
	}
	if len(ns) == 0 {
		c.JSON(400, gin.H{"error": "无紧急联系人，无法发送超时提醒"})
		return
	}
	var lat, lng float64
	var loc map[string]any
	if json.Unmarshal([]byte(gs.LastLocationJSON), &loc) == nil {
		if v, ok := loc["lat"].(float64); ok {
			lat = v
		}
		if v, ok := loc["lng"].(float64); ok {
			lng = v
		}
	}
	res := s.Notify.SendSOS(notify.SOSPayload{
		UserID: uid, UserName: user.Name, Phone: user.Phone, Contacts: ns,
		Lat: lat, Lng: lng,
		Message: "守护已超过计划时长，请确认对方是否安全",
		Channel: "all", TrackURL: s.Cfg.PublicBaseURL + "/guard",
	})
	now := time.Now()
	gs.OvertimeNotifiedAt = &now
	s.DB.Save(&gs)
	c.JSON(200, gin.H{"data": gin.H{
		"ok": true, "overtime": true, "notified": true, "already": false,
		"notify": res, "message": res.Message,
	}})
}
