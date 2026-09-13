package httpapi

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"mountpath/mobileback/internal/db"
	"mountpath/mobileback/internal/domain"
)

func (s *Server) loadRouteMaps(routeID string) (route, detail map[string]any, err error) {
	var row db.Route
	if err = s.DB.First(&row, "id = ?", routeID).Error; err != nil {
		return nil, nil, err
	}
	route = map[string]any{}
	_ = json.Unmarshal([]byte(row.Payload), &route)

	var extra db.RouteDetailExtra
	if e := s.DB.First(&extra, "route_id = ?", routeID).Error; e == nil {
		detail = map[string]any{}
		_ = json.Unmarshal([]byte(extra.Payload), &detail)
	} else {
		detail = domain.EnrichRoute(copyAnyMap(route), domain.CurrentSeason(time.Now()))
	}
	return route, detail, nil
}

func (s *Server) loadTrackBundle(routeID string) map[string]any {
	var bundle db.TrackBundle
	if err := s.DB.First(&bundle, "route_id = ?", routeID).Error; err != nil {
		return map[string]any{
			"total": 0, "community_count": 0, "official_id": nil, "recommended_id": nil,
			"filter_tags": []any{}, "tracks": []any{},
		}
	}
	var m map[string]any
	_ = json.Unmarshal([]byte(bundle.Payload), &m)
	if m == nil {
		m = map[string]any{}
	}
	return m
}

func (s *Server) saveTrackBundle(routeID string, m map[string]any) {
	s.DB.Save(&db.TrackBundle{RouteID: routeID, Payload: mustJSON(m)})
}

func (s *Server) findTrackInBundle(bundle map[string]any, trackID string) map[string]any {
	tracks, _ := bundle["tracks"].([]any)
	for _, t := range tracks {
		m, ok := t.(map[string]any)
		if !ok {
			continue
		}
		if str(m["id"]) == trackID {
			return m
		}
	}
	return nil
}

func (s *Server) officialTrackID(bundle map[string]any, routeID string) string {
	if id := str(bundle["official_id"]); id != "" {
		return id
	}
	tracks, _ := bundle["tracks"].([]any)
	for _, t := range tracks {
		m, ok := t.(map[string]any)
		if ok && asBool(m["is_official"]) {
			return str(m["id"])
		}
	}
	return "trk_official_" + routeID
}

func (s *Server) loadPublishedAnns(trackID string) []map[string]any {
	var pt db.PublishedTrack
	if err := s.DB.First(&pt, "id = ?", trackID).Error; err != nil {
		return nil
	}
	var full map[string]any
	_ = json.Unmarshal([]byte(pt.Payload), &full)
	raw, _ := full["annotations"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, a := range raw {
		if m, ok := a.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func (s *Server) loadDraftAnns(routeID, sessionID string) []map[string]any {
	var rows []db.WalkAnnotation
	q := s.DB.Where("route_id = ?", routeID)
	if sessionID != "" {
		q = q.Where("session_id = ?", sessionID)
	}
	q.Order("progress asc").Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{
			"id": r.ID, "route_id": r.RouteID, "session_id": r.SessionID,
			"kind": r.Kind, "title": r.Title, "note": r.Note,
			"progress": r.Progress, "distance_km": r.DistanceKm,
			"altitude_m": r.AltitudeM, "author": r.Author,
			"created_at": r.CreatedAt.Format(time.RFC3339),
		})
	}
	return out
}

func (s *Server) buildWalk(
	routeID string,
	progress, offsetM float64,
	trackID, walkSessionID string,
) (map[string]any, error) {
	route, detail, err := s.loadRouteMaps(routeID)
	if err != nil {
		return nil, err
	}
	dist := asFloat64(route["distance"])
	if dist <= 0 {
		dist = asFloat64(detail["distance"])
	}
	bundle := s.loadTrackBundle(routeID)
	selectedID := trackID
	if selectedID == "" {
		selectedID = s.officialTrackID(bundle, routeID)
	}
	selected := s.findTrackInBundle(bundle, selectedID)
	if selected == nil {
		selectedID = s.officialTrackID(bundle, routeID)
		selected = s.findTrackInBundle(bundle, selectedID)
	}

	officialAnns := domain.OfficialAnnsFromRiskMarkers(routeID, detail, dist)
	var communityAnns []map[string]any
	if selected != nil && !asBool(selected["is_official"]) {
		communityAnns = s.loadPublishedAnns(selectedID)
		if selected["author"] != nil {
			for i := range communityAnns {
				communityAnns[i]["track_author"] = selected["author"]
			}
		}
	}
	draftAnns := s.loadDraftAnns(routeID, walkSessionID)

	return domain.BuildWalkState(
		route, detail, progress, offsetM, selected,
		officialAnns, communityAnns, draftAnns, walkSessionID,
	), nil
}

func (s *Server) bumpTrackUse(routeID, trackID string) {
	bundle := s.loadTrackBundle(routeID)
	tracks, _ := bundle["tracks"].([]any)
	changed := false
	for i, t := range tracks {
		m, ok := t.(map[string]any)
		if !ok || str(m["id"]) != trackID {
			continue
		}
		m["use_count"] = asFloat64(m["use_count"]) + 1
		m["updated_at"] = time.Now().UTC().Format(time.RFC3339)
		tracks[i] = m
		changed = true
		break
	}
	if changed {
		bundle["tracks"] = tracks
		s.saveTrackBundle(routeID, bundle)
	}
	var pt db.PublishedTrack
	if s.DB.First(&pt, "id = ?", trackID).Error == nil {
		var full map[string]any
		_ = json.Unmarshal([]byte(pt.Payload), &full)
		full["use_count"] = asFloat64(full["use_count"]) + 1
		full["updated_at"] = time.Now().UTC().Format(time.RFC3339)
		pt.Payload = mustJSON(full)
		s.DB.Save(&pt)
	}
}

func (s *Server) trackList(c *gin.Context) {
	routeID := c.Param("routeId")
	var route db.Route
	if err := s.DB.First(&route, "id = ?", routeID).Error; err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	c.JSON(200, gin.H{"data": s.loadTrackBundle(routeID)})
}

func (s *Server) trackGet(c *gin.Context) {
	routeID := c.Param("routeId")
	progress := parseFloatQuery(c.Query("progress"), 0)
	offset := parseFloatQuery(c.Query("offset_m"), 0)
	walk, err := s.buildWalk(routeID, progress, offset, c.Query("track_id"), c.Query("walk_session_id"))
	if err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	c.JSON(200, gin.H{"data": walk})
}

func (s *Server) trackStart(c *gin.Context) {
	var body struct {
		RouteID   string `json:"route_id"`
		TripID    string `json:"trip_id"`
		WithGuard *bool  `json:"with_guard"`
		TrackID   string `json:"track_id"`
	}
	_ = c.BindJSON(&body)
	uid := s.uid(c)
	routeID := body.RouteID
	if routeID == "" {
		if cur := s.currentTrip(uid); cur != nil {
			routeID = cur.RouteID
		}
	}
	if routeID == "" {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	var route db.Route
	if err := s.DB.First(&route, "id = ?", routeID).Error; err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}

	cur := s.currentTrip(uid)
	if cur == nil || cur.RouteID != routeID {
		c.JSON(403, gin.H{"error": "请先将该路线加入行程", "code": "need_trip"})
		return
	}
	var activeGuard db.GuardSession
	guardActive := s.DB.Where("user_id = ? AND status = ?", uid, "active").First(&activeGuard).Error == nil &&
		(activeGuard.RouteID == routeID || (cur.GuardSessionID != nil && *cur.GuardSessionID == activeGuard.ID))
	access := canUseTrack(cur, guardActive)
	if allowed, _ := access["allowed"].(bool); !allowed {
		c.JSON(403, gin.H{
			"error":         "示意跟线需先开启行中守护",
			"code":          "need_track_access",
			"track_access":  access,
		})
		return
	}

	bundle := s.loadTrackBundle(routeID)
	selectedID := body.TrackID
	if selectedID == "" {
		selectedID = s.officialTrackID(bundle, routeID)
	} else if s.findTrackInBundle(bundle, selectedID) == nil {
		selectedID = s.officialTrackID(bundle, routeID)
	} else {
		s.bumpTrackUse(routeID, selectedID)
	}

	withGuard := false
	if body.WithGuard != nil {
		withGuard = *body.WithGuard
	}
	var guard *db.GuardSession
	if guardActive {
		guard = &activeGuard
	} else if withGuard {
		guardians := s.contactGuardianNames(uid)
		if len(guardians) == 0 {
			c.JSON(400, gin.H{"error": "开启守护前请先在安全中心添加紧急联系人", "code": "need_contacts"})
			return
		}
		tripID := body.TripID
		hours := cur.PlannedDurationHours
		if hours <= 0 {
			var rm map[string]any
			_ = json.Unmarshal([]byte(route.Payload), &rm)
			hours = plannedHoursFromRoutePayload(rm)
		}
		if tripID == "" {
			tripID = cur.ID
		}
		tripPtr := &tripID
		loc := gin.H{"timestamp": time.Now().Format(time.RFC3339), "fix": "pending", "note": "等待首次 GPS 上报"}
		gs := db.GuardSession{
			ID: "gs_" + uuid.NewString()[:10], UserID: uid, RouteID: routeID, TripID: tripPtr,
			Status: "active", StartedAt: time.Now(), PlannedDurationHours: hours,
			GuardiansJSON:    mustJSON(guardians),
			LastLocationJSON: mustJSON(loc),
		}
		s.DB.Create(&gs)
		s.DB.Model(&db.Trip{}).Where("id = ? AND user_id = ?", tripID, uid).
			Update("guard_session_id", gs.ID)
		guard = &gs
	}

	walkSessionID := "walk_" + uuid.NewString()[:10]
	s.DB.Create(&db.WalkSession{
		ID: walkSessionID, UserID: uid, RouteID: routeID, TrackID: selectedID,
		Progress: 0, OffsetM: 0, Status: "active", StartedAt: time.Now(), UpdatedAt: time.Now(),
	})

	walk, err := s.buildWalk(routeID, 0, 0, selectedID, walkSessionID)
	if err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}

	var guardOut any
	if guard != nil {
		var loc any
		_ = json.Unmarshal([]byte(guard.LastLocationJSON), &loc)
		var gnames []string
		_ = json.Unmarshal([]byte(guard.GuardiansJSON), &gnames)
		guardOut = gin.H{
			"id": guard.ID, "route_id": guard.RouteID, "status": guard.Status,
			"started_at": guard.StartedAt.Format(time.RFC3339), "last_location": loc,
			"guardians": gnames, "planned_duration_hours": guard.PlannedDurationHours,
		}
	}

	var payload map[string]any
	_ = json.Unmarshal([]byte(route.Payload), &payload)
	distKm := asFloat64(payload["distance"])
	if distKm <= 0 {
		distKm = 10
	}
	startLat, startLng := s.Cfg.WeatherLat, s.Cfg.WeatherLng
	anchorNote := "默认天气锚点（示意，非实测 GPX）"
	if province, ok := payload["province"].(string); ok {
		if lat, lng, hit := domain.ProvinceApproxCoords(province); hit {
			startLat, startLng = lat, lng
			anchorNote = "省份示意锚点（" + province + "），非路线实测 GPX"
		}
	}

	c.JSON(200, gin.H{"data": gin.H{
		"walk": walk, "guard_session": guardOut,
		"walk_session_id": walkSessionID, "track_id": selectedID,
		"started_at": time.Now().Format(time.RFC3339),
		"trail": gin.H{
			"start_lat": startLat, "start_lng": startLng,
			"distance_km": distKm, "route_id": routeID,
			"schematic": true, "note": anchorNote,
		},
	}})
}

func (s *Server) trackProgress(c *gin.Context) {
	var body struct {
		RouteID       string  `json:"route_id"`
		Progress      float64 `json:"progress"`
		SessionID     string  `json:"session_id"`
		OffsetM       float64 `json:"offset_m"`
		TrackID       string  `json:"track_id"`
		WalkSessionID string  `json:"walk_session_id"`
	}
	if err := c.BindJSON(&body); err != nil || body.RouteID == "" {
		c.JSON(400, gin.H{"error": "缺少 route_id"})
		return
	}
	walk, err := s.buildWalk(body.RouteID, body.Progress, body.OffsetM, body.TrackID, body.WalkSessionID)
	if err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}

	if body.WalkSessionID != "" {
		s.DB.Model(&db.WalkSession{}).Where("id = ?", body.WalkSessionID).Updates(map[string]any{
			"progress": body.Progress, "offset_m": body.OffsetM, "updated_at": time.Now(),
		})
	}
	// 不再用示意进度合成坐标写回守护会话，避免覆盖真机 GPS 打卡

	c.JSON(200, gin.H{"data": walk})
}

func (s *Server) trackEnd(c *gin.Context) {
	uid := s.uid(c)
	var body struct {
		WalkSessionID string  `json:"walk_session_id"`
		Progress      float64 `json:"progress"`
		RouteID       string  `json:"route_id"`
	}
	if err := c.BindJSON(&body); err != nil || body.WalkSessionID == "" {
		c.JSON(400, gin.H{"error": "缺少 walk_session_id"})
		return
	}
	s.endWalkSession(uid, body.WalkSessionID, body.Progress)
	c.JSON(200, gin.H{"data": gin.H{"ok": true, "walk_session_id": body.WalkSessionID, "status": "ended"}})
}

func (s *Server) trackAnnotate(c *gin.Context) {
	var body struct {
		RouteID       string  `json:"route_id"`
		TripID        string  `json:"trip_id"`
		Kind          string  `json:"kind"`
		Title         string  `json:"title"`
		Note          string  `json:"note"`
		Progress      float64 `json:"progress"`
		WalkSessionID string  `json:"walk_session_id"`
		TrackID       string  `json:"track_id"`
		OffsetM       float64 `json:"offset_m"`
	}
	if err := c.BindJSON(&body); err != nil || body.RouteID == "" {
		c.JSON(400, gin.H{"error": "缺少 route_id"})
		return
	}
	note := strings.TrimSpace(body.Note)
	if note == "" {
		c.JSON(400, gin.H{"error": "请填写标注内容"})
		return
	}
	if len([]rune(note)) > 300 {
		c.JSON(400, gin.H{"error": "标注请控制在 300 字以内"})
		return
	}
	kind := body.Kind
	if kind == "" {
		kind = "note"
	}
	if _, ok := domain.KindLabels[kind]; !ok {
		kind = "note"
	}

	walk, err := s.buildWalk(body.RouteID, body.Progress, body.OffsetM, body.TrackID, body.WalkSessionID)
	if err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}

	occupied := make([]domain.AnnAnchor, 0)
	if anns, ok := walk["annotations"].([]map[string]any); ok {
		for _, a := range anns {
			title := str(a["title"])
			if title == "" {
				title = str(a["kind_label"])
			}
			occupied = append(occupied, domain.AnnAnchor{
				ID: str(a["id"]), Progress: asFloat64(a["progress"]),
				IsOfficial: asBool(a["is_official"]), Title: title,
			})
		}
	} else if raw, ok := walk["annotations"].([]any); ok {
		for _, item := range raw {
			a, ok := item.(map[string]any)
			if !ok {
				continue
			}
			title := str(a["title"])
			if title == "" {
				title = str(a["kind_label"])
			}
			occupied = append(occupied, domain.AnnAnchor{
				ID: str(a["id"]), Progress: asFloat64(a["progress"]),
				IsOfficial: asBool(a["is_official"]), Title: title,
			})
		}
	}

	prog := asFloat64(walk["progress"])
	distTotal := asFloat64(walk["distance_total_km"])
	if conflict, gap := domain.FindAnnotationConflict(prog, distTotal, occupied); conflict != nil {
		who := "已有"
		if conflict.IsOfficial {
			who = "官方"
		}
		c.JSON(400, gin.H{"error": "距" + who + "标注约 " + itoaRound(gap) + " 米，须间隔 ≥5 米"})
		return
	}

	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = domain.KindLabels[kind]
	}
	uid := s.uid(c)
	var user db.User
	author := "山途旅人"
	if s.DB.First(&user, "id = ?", uid).Error == nil && user.Name != "" {
		author = user.Name
	}
	alt := asFloat64(walk["altitude_m"])
	ann := db.WalkAnnotation{
		ID: "ann_" + uuid.NewString()[:10], SessionID: body.WalkSessionID, RouteID: body.RouteID,
		UserID: uid, Kind: kind, Title: title, Note: note, Progress: prog,
		DistanceKm: asFloat64(walk["distance_km"]), AltitudeM: &alt, Author: author,
		CreatedAt: time.Now(),
	}
	if err := s.DB.Create(&ann).Error; err != nil {
		c.JSON(500, gin.H{"error": "保存标注失败"})
		return
	}

	data := map[string]any{
		"id": ann.ID, "route_id": ann.RouteID, "session_id": ann.SessionID,
		"kind": ann.Kind, "title": ann.Title, "note": ann.Note,
		"progress": ann.Progress, "distance_km": ann.DistanceKm,
		"altitude_m": ann.AltitudeM, "author": ann.Author,
		"created_at": ann.CreatedAt.Format(time.RFC3339),
		"kind_label": domain.KindLabels[kind],
	}
	walk2, _ := s.buildWalk(body.RouteID, prog, body.OffsetM, body.TrackID, body.WalkSessionID)
	c.JSON(200, gin.H{"data": data, "walk": walk2})
}

func (s *Server) trackDelAnnotation(c *gin.Context) {
	routeID := c.Query("route_id")
	if routeID == "" {
		c.JSON(400, gin.H{"error": "缺少 route_id"})
		return
	}
	id := c.Param("id")
	res := s.DB.Where("id = ? AND route_id = ?", id, routeID).Delete(&db.WalkAnnotation{})
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "标注不存在"})
		return
	}
	progress := parseFloatQuery(c.Query("progress"), 0)
	offset := parseFloatQuery(c.Query("offset_m"), 0)
	walk, _ := s.buildWalk(routeID, progress, offset, c.Query("track_id"), c.Query("walk_session_id"))
	c.JSON(200, gin.H{"data": gin.H{"ok": true}, "walk": walk})
}

func (s *Server) trackPublish(c *gin.Context) {
	var body struct {
		RouteID       string `json:"route_id"`
		Title         string `json:"title"`
		Summary       string `json:"summary"`
		Author        string `json:"author"`
		WalkSessionID string `json:"walk_session_id"`
	}
	if err := c.BindJSON(&body); err != nil || body.RouteID == "" {
		c.JSON(400, gin.H{"error": "缺少 route_id"})
		return
	}
	route, detail, err := s.loadRouteMaps(body.RouteID)
	if err != nil {
		c.JSON(404, gin.H{"error": "路线不存在"})
		return
	}
	anns := s.loadDraftAnns(body.RouteID, body.WalkSessionID)
	name := str(route["name"])
	if name == "" {
		name = str(detail["name"])
	}
	author := strings.TrimSpace(body.Author)
	if author == "" {
		uid := s.uid(c)
		var user db.User
		if s.DB.First(&user, "id = ?", uid).Error == nil && user.Name != "" {
			author = user.Name
		} else {
			author = "徒步爱好者"
		}
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = name + " · " + author + "的轨迹"
	}
	summary := strings.TrimSpace(body.Summary)
	if summary == "" {
		if len(anns) > 0 {
			summary = "含 " + itoaInt(len(anns)) + " 个现场标注，供后续同行参考。"
		} else {
			summary = "基于示意轨迹完走并发布，暂无额外标注。"
		}
	}
	id := "trk_user_" + uuid.NewString()[:10]
	now := time.Now().UTC().Format(time.RFC3339)
	full := map[string]any{
		"id": id, "route_id": body.RouteID, "title": title, "summary": summary,
		"is_official": false, "recommended": false, "author": author, "author_level": 5,
		"distance_km": route["distance"], "elevation_gain_m": route["elevation_gain"],
		"annotation_count": len(anns), "annotations": anns,
		"use_count": 0, "complete_count": 1, "rating": 0, "rating_count": 0,
		"feedback": map[string]any{"useful": 0, "outdated": 0, "hard": 0},
		"created_at": now, "updated_at": now,
		"tags": func() []string {
			if len(anns) > 0 {
				return []string{"社区", "含标注"}
			}
			return []string{"社区"}
		}(),
	}
	s.DB.Create(&db.PublishedTrack{
		ID: id, RouteID: body.RouteID, IsOfficial: false, Recommended: false, Payload: mustJSON(full),
	})

	bundle := s.loadTrackBundle(body.RouteID)
	summaryItem := map[string]any{
		"id": id, "title": title, "summary": summary, "is_official": false, "recommended": false,
		"author": author, "author_level": 5, "distance_km": route["distance"],
		"elevation_gain_m": route["elevation_gain"], "annotation_count": len(anns),
		"use_count": 0, "complete_count": 1, "rating": 0, "rating_count": 0,
		"feedback": full["feedback"], "tags": full["tags"],
		"created_at": now, "updated_at": now,
	}
	tracks, _ := bundle["tracks"].([]any)
	tracks = append(tracks, summaryItem)
	bundle["tracks"] = tracks
	bundle["total"] = len(tracks)
	community := 0
	for _, t := range tracks {
		if m, ok := t.(map[string]any); ok && !asBool(m["is_official"]) {
			community++
		}
	}
	bundle["community_count"] = community
	s.saveTrackBundle(body.RouteID, bundle)

	if body.WalkSessionID != "" {
		s.DB.Where("session_id = ? AND route_id = ?", body.WalkSessionID, body.RouteID).
			Delete(&db.WalkAnnotation{})
	}

	c.JSON(200, gin.H{"data": full, "track_info": bundle})
}

func (s *Server) trackFeedback(c *gin.Context) {
	var body struct {
		TrackID string  `json:"track_id"`
		Type    string  `json:"type"`
		Rating  float64 `json:"rating"`
	}
	if err := c.BindJSON(&body); err != nil || body.TrackID == "" || body.Type == "" {
		c.JSON(400, gin.H{"error": "缺少 track_id 或 type"})
		return
	}

	var routeID string
	var pt db.PublishedTrack
	full := map[string]any{}
	if s.DB.First(&pt, "id = ?", body.TrackID).Error == nil {
		routeID = pt.RouteID
		_ = json.Unmarshal([]byte(pt.Payload), &full)
	} else {
		// update summary-only seed track inside bundle
		var bundles []db.TrackBundle
		s.DB.Find(&bundles)
		for _, b := range bundles {
			var m map[string]any
			_ = json.Unmarshal([]byte(b.Payload), &m)
			if t := s.findTrackInBundle(m, body.TrackID); t != nil {
				routeID = b.RouteID
				full = t
				break
			}
		}
		if routeID == "" {
			c.JSON(400, gin.H{"error": "轨迹不存在"})
			return
		}
	}

	fb, _ := full["feedback"].(map[string]any)
	if fb == nil {
		fb = map[string]any{"useful": 0, "outdated": 0, "hard": 0}
	}
	switch body.Type {
	case "rating":
		r := body.Rating
		if r < 1 || r > 5 {
			c.JSON(400, gin.H{"error": "评分无效"})
			return
		}
		rc := asFloat64(full["rating_count"])
		total := asFloat64(full["rating"])*rc + r
		rc++
		full["rating_count"] = rc
		full["rating"] = float64(int((total/rc)*10+0.5)) / 10
	case "useful", "outdated", "hard":
		fb[body.Type] = asFloat64(fb[body.Type]) + 1
		full["feedback"] = fb
	default:
		c.JSON(400, gin.H{"error": "反馈类型无效"})
		return
	}
	full["updated_at"] = time.Now().UTC().Format(time.RFC3339)
	full["route_id"] = routeID

	if pt.ID != "" {
		pt.Payload = mustJSON(full)
		s.DB.Save(&pt)
	}

	bundle := s.loadTrackBundle(routeID)
	tracks, _ := bundle["tracks"].([]any)
	for i, t := range tracks {
		m, ok := t.(map[string]any)
		if !ok || str(m["id"]) != body.TrackID {
			continue
		}
		m["feedback"] = full["feedback"]
		m["rating"] = full["rating"]
		m["rating_count"] = full["rating_count"]
		m["updated_at"] = full["updated_at"]
		tracks[i] = m
		break
	}
	bundle["tracks"] = tracks
	s.saveTrackBundle(routeID, bundle)

	c.JSON(200, gin.H{"data": full, "track_info": bundle})
}

func parseFloatQuery(s string, def float64) float64 {
	if s == "" {
		return def
	}
	var f float64
	if _, err := parseFloat(s, &f); err != nil {
		return def
	}
	return f
}

func parseFloat(s string, out *float64) (int, error) {
	n, err := json.Number(s).Float64()
	if err != nil {
		return 0, err
	}
	*out = n
	return 1, nil
}

func asFloat64(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func asBool(v any) bool {
	b, _ := v.(bool)
	return b
}

func copyAnyMap(m map[string]any) map[string]any {
	cp := make(map[string]any, len(m))
	for k, v := range m {
		cp[k] = v
	}
	return cp
}

func itoaRound(v float64) string {
	return itoaInt(int(v + 0.5))
}

func itoaInt(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := make([]byte, 0, 12)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
