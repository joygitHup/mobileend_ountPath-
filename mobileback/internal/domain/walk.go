package domain

import (
	"math"
	"sort"
)

const MinAnnotationGapM = 5.0

var KindLabels = map[string]string{
	"note":      "路况备注",
	"hazard":    "危险提示",
	"water":     "水源",
	"viewpoint": "观景点",
	"rest":      "休息点",
	"photo":     "打卡点",
}

type AnnAnchor struct {
	ID         string
	Progress   float64
	IsOfficial bool
	Title      string
}

func AlongRouteGapM(a, b, routeDistanceKm float64) float64 {
	return math.Abs(a-b) * routeDistanceKm * 1000
}

func FindAnnotationConflict(progress, routeDistanceKm float64, existing []AnnAnchor) (conflict *AnnAnchor, gapM float64) {
	var nearest *AnnAnchor
	nearestGap := 0.0
	for i := range existing {
		a := &existing[i]
		gap := AlongRouteGapM(progress, a.Progress, routeDistanceKm)
		if gap < MinAnnotationGapM {
			if nearest == nil || gap < nearestGap {
				nearest = a
				nearestGap = gap
			}
		}
	}
	return nearest, nearestGap
}

// BuildWalkState 生成与 Express track.walkState 兼容的结构
func BuildWalkState(
	route map[string]any,
	detail map[string]any,
	progress float64,
	offsetM float64,
	selectedTrack map[string]any, // nil ok
	officialAnns []map[string]any,
	communityAnns []map[string]any,
	draftAnns []map[string]any,
	walkSessionID string,
) map[string]any {
	p := clamp01(progress)
	dist := asFloat(route["distance"])
	if dist <= 0 {
		dist = asFloat(detail["distance"])
	}
	distanceKm := round2(dist * p)
	remainingKm := round2(dist * (1 - p))
	offset := clamp(offsetM, -120, 120)
	absOffset := math.Abs(offset)

	offLevel := "ok"
	offMsg := "当前在示意轨迹走廊内"
	offVoice := ""
	side := "左"
	if offset > 0 {
		side = "右"
	}
	if absOffset >= 45 {
		offLevel = "danger"
		offMsg = "已严重偏离示意轨迹约 " + itoa(int(math.Round(absOffset))) + " 米（偏" + side + "侧），请立即返回示意走廊"
		offVoice = "注意，您已偏离示意轨迹约 " + itoa(int(math.Round(absOffset))) + " 米，请立即返回"
	} else if absOffset >= 25 {
		offLevel = "warn"
		offMsg = "即将偏离示意轨迹（偏" + side + "侧约 " + itoa(int(math.Round(absOffset))) + " 米），请调整方向"
		offVoice = "提醒，您正在偏离示意轨迹，请调整方向返回"
	}

	altitude := interpolateAltitude(detail, distanceKm)

	markers := riskMarkersWithDelta(detail, dist, p)
	nearby := filterMarkers(markers, func(m map[string]any) bool {
		return math.Abs(asFloat(m["delta_km"])) <= 0.35
	})
	ahead := filterMarkers(markers, func(m map[string]any) bool {
		d := asFloat(m["delta_km"])
		return d > 0 && d <= 1.5
	})
	passed := filterMarkers(markers, func(m map[string]any) bool {
		return asFloat(m["delta_km"]) < -0.05
	})

	alerts := buildAlerts(nearby, ahead)
	nextCp := nextCheckpoint(route, distanceKm)

	enrichAnns := func(list []map[string]any, source string, editable, isOfficial bool) []map[string]any {
		out := make([]map[string]any, 0, len(list))
		for _, a := range list {
			cp := copyMap(a)
			kind := strVal(cp["kind"])
			cp["kind_label"] = KindLabels[kind]
			if cp["kind_label"] == nil || cp["kind_label"] == "" {
				cp["kind_label"] = "标注"
			}
			cp["delta_km"] = round2((asFloat(cp["progress"]) - p) * dist)
			cp["source"] = source
			cp["is_official"] = isOfficial
			cp["editable"] = editable
			out = append(out, cp)
		}
		return out
	}

	off := enrichAnns(officialAnns, "official", false, true)
	com := enrichAnns(communityAnns, "community", false, false)
	draft := enrichAnns(draftAnns, "draft", true, false)

	seen := map[string]bool{}
	annotations := make([]map[string]any, 0, len(off)+len(com)+len(draft))
	for _, group := range [][]map[string]any{off, com, draft} {
		for _, a := range group {
			id := strVal(a["id"])
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			annotations = append(annotations, a)
		}
	}
	sort.Slice(annotations, func(i, j int) bool {
		return asFloat(annotations[i]["progress"]) < asFloat(annotations[j]["progress"])
	})

	occupied := make([]AnnAnchor, 0, len(annotations))
	for _, a := range annotations {
		title := strVal(a["title"])
		if title == "" {
			title = strVal(a["kind_label"])
		}
		occupied = append(occupied, AnnAnchor{
			ID: strVal(a["id"]), Progress: asFloat(a["progress"]),
			IsOfficial: asBool(a["is_official"]), Title: title,
		})
	}
	conflict, gap := FindAnnotationConflict(p, dist, occupied)
	canAnnotate := conflict == nil
	var blockReason any
	if conflict != nil {
		who := "已有"
		if conflict.IsOfficial {
			who = "官方"
		}
		blockReason = "距" + who + "标注约 " + itoa(int(math.Round(gap))) + " 米，须间隔 ≥" + itoa(int(MinAnnotationGapM)) + " 米"
	}

	kinds := make([]map[string]any, 0, len(KindLabels))
	for id, label := range KindLabels {
		kinds = append(kinds, map[string]any{"id": id, "label": label})
	}
	sort.Slice(kinds, func(i, j int) bool { return strVal(kinds[i]["id"]) < strVal(kinds[j]["id"]) })

	var trackBrief any
	if selectedTrack != nil {
		trackBrief = map[string]any{
			"id": selectedTrack["id"], "title": selectedTrack["title"],
			"is_official": selectedTrack["is_official"], "recommended": selectedTrack["recommended"],
			"author": selectedTrack["author"], "use_count": selectedTrack["use_count"],
			"rating": selectedTrack["rating"],
		}
	}

	name := strVal(route["name"])
	if name == "" {
		name = strVal(detail["name"])
	}

	return map[string]any{
		"route_id":                   strVal(route["id"]),
		"route_name":                 name,
		"distance_total_km":          dist,
		"progress":                   p,
		"distance_km":                distanceKm,
		"remaining_km":               remainingKm,
		"altitude_m":                 altitude,
		"risk_markers":               markers,
		"nearby_risks":               nearby,
		"ahead_risks":                ahead,
		"passed_count":               len(passed),
		"next_checkpoint":            nextCp,
		"alerts":                     alerts,
		"elevation_profile":          detail["elevation_profile"],
		"annotations":                annotations,
		"draft_count":                len(draft),
		"official_annotation_count":  len(off),
		"community_annotation_count": len(com),
		"annotation_kinds":           kinds,
		"annotation_gap_m":           MinAnnotationGapM,
		"can_annotate":               canAnnotate,
		"annotate_block_reason":      blockReason,
		"offset_m":                   int(math.Round(offset)),
		"corridor_m":                 30,
		"off_track":                  offLevel != "ok",
		"off_track_level":            offLevel,
		"off_track_message":          offMsg,
		"off_track_voice":            offVoice,
		"track":                      trackBrief,
		"walk_session_id":            nilIfEmpty(walkSessionID),
	}
}

func OfficialAnnsFromRiskMarkers(routeID string, detail map[string]any, dist float64) []map[string]any {
	raw, _ := detail["risk_markers"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for i, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		typ := strVal(m["type"])
		kind := "note"
		switch typ {
		case "water":
			kind = "water"
		case "steep", "cliff", "no_signal":
			kind = "hazard"
		}
		prog := asFloat(m["progress"])
		out = append(out, map[string]any{
			"id":          "trk_official_" + routeID + "_ann_" + itoa(i),
			"route_id":    routeID,
			"kind":        kind,
			"title":       strVal(m["label"]),
			"note":        strVal(m["note"]),
			"progress":    prog,
			"distance_km": round2(prog * dist),
			"altitude_m":  nil,
			"author":      "山途官方",
		})
	}
	return out
}

func riskMarkersWithDelta(detail map[string]any, dist, p float64) []map[string]any {
	raw, _ := detail["risk_markers"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		cp := copyMap(m)
		prog := asFloat(cp["progress"])
		cp["distance_km"] = round2(prog * dist)
		cp["delta_km"] = round2((prog - p) * dist)
		out = append(out, cp)
	}
	sort.Slice(out, func(i, j int) bool {
		return asFloat(out[i]["progress"]) < asFloat(out[j]["progress"])
	})
	return out
}

func filterMarkers(markers []map[string]any, pred func(map[string]any) bool) []map[string]any {
	out := make([]map[string]any, 0)
	for _, m := range markers {
		if pred(m) {
			out = append(out, m)
		}
	}
	return out
}

func buildAlerts(nearby, ahead []map[string]any) []map[string]any {
	alerts := make([]map[string]any, 0)
	for _, m := range nearby {
		level := "info"
		typ := strVal(m["type"])
		if typ == "cliff" || typ == "no_signal" {
			level = "danger"
		} else if typ == "steep" {
			level = "warn"
		}
		title := "正经过：" + strVal(m["label"])
		if asFloat(m["delta_km"]) >= 0 {
			title = "接近：" + strVal(m["label"])
		}
		alerts = append(alerts, map[string]any{"level": level, "title": title, "body": strVal(m["note"])})
	}
	seen := map[string]bool{}
	for _, m := range nearby {
		seen[strVal(m["id"])] = true
	}
	n := 0
	for _, m := range ahead {
		if seen[strVal(m["id"])] {
			continue
		}
		level := "warn"
		if strVal(m["type"]) == "water" {
			level = "info"
		}
		alerts = append(alerts, map[string]any{
			"level": level,
			"title": "前方 " + format1(asFloat(m["delta_km"])) + "km · " + strVal(m["label"]),
			"body":  strVal(m["note"]),
		})
		n++
		if n >= 2 {
			break
		}
	}
	return alerts
}

func nextCheckpoint(route map[string]any, distanceKm float64) any {
	raw, _ := route["checkpoints"].([]any)
	if raw == nil {
		return nil
	}
	for _, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		dk := asFloat(m["distance_km"])
		if dk >= distanceKm-0.05 {
			return map[string]any{
				"name": m["name"], "distance_km": dk,
				"has_water": m["has_water"], "has_signal": m["has_signal"],
				"ahead_km": round2(dk - distanceKm),
			}
		}
	}
	return nil
}

func interpolateAltitude(detail map[string]any, distanceKm float64) int {
	ep, _ := detail["elevation_profile"].(map[string]any)
	if ep == nil {
		return 0
	}
	pts, _ := ep["points"].([]any)
	if len(pts) == 0 {
		return 0
	}
	first, _ := pts[0].(map[string]any)
	alt := asFloat(first["altitude_m"])
	for i := 1; i < len(pts); i++ {
		a, _ := pts[i-1].(map[string]any)
		b, _ := pts[i].(map[string]any)
		if a == nil || b == nil {
			continue
		}
		ad, bd := asFloat(a["distance_km"]), asFloat(b["distance_km"])
		if distanceKm >= ad && distanceKm <= bd {
			t := (distanceKm - ad) / math.Max(0.01, bd-ad)
			return int(math.Round(asFloat(a["altitude_m"]) + (asFloat(b["altitude_m"])-asFloat(a["altitude_m"]))*t))
		}
		if distanceKm >= bd {
			alt = asFloat(b["altitude_m"])
		}
	}
	return int(math.Round(alt))
}

func asFloat(v any) float64 {
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

func strVal(v any) string {
	s, _ := v.(string)
	return s
}

func clamp01(v float64) float64 { return clamp(v, 0, 1) }

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func itoa(n int) string {
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

func format1(v float64) string {
	// one decimal place without fmt to keep deps light
	x := int(math.Round(v * 10))
	neg := x < 0
	if neg {
		x = -x
	}
	whole, frac := x/10, x%10
	s := itoa(whole) + "." + itoa(frac)
	if neg {
		return "-" + s
	}
	return s
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func copyMap(m map[string]any) map[string]any {
	cp := make(map[string]any, len(m))
	for k, v := range m {
		cp[k] = v
	}
	return cp
}
