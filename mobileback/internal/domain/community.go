package domain

import (
	"sort"
	"strings"
	"time"
)

func DaysAgo(iso string, now time.Time) int {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, iso)
	}
	if err != nil {
		return 0
	}
	d := int(now.Sub(t).Hours() / 24)
	if d < 0 {
		return 0
	}
	return d
}

func FreshnessLabel(days int) string {
	switch {
	case days <= 0:
		return "今天更新"
	case days == 1:
		return "1 天前"
	case days <= 7:
		return itoa(days) + " 天前"
	case days <= 30:
		return itoa((days+6)/7) + " 周前"
	case days <= 180:
		return itoa((days+29)/30) + " 个月前"
	default:
		return "较旧，仅供参考"
	}
}

func MapDisplayType(post map[string]any) string {
	typ := strVal(post["type"])
	switch typ {
	case "companion", "question", "guide":
		return typ
	}
	days := DaysAgo(strVal(post["created_at"]), time.Now())
	hay := strVal(post["title"]) + strVal(post["content"])
	if days <= 14 || strings.Contains(hay, "路况") || strings.Contains(hay, "劝返") ||
		strings.Contains(hay, "近期") || strings.Contains(hay, "本周") {
		return "condition"
	}
	return "review"
}

func TypeLabel(display string) string {
	switch display {
	case "guide":
		return "攻略"
	case "condition":
		return "路况"
	case "question":
		return "求助"
	case "companion":
		return "约伴"
	default:
		return "体验"
	}
}

func EnrichCommunityPost(post map[string]any, routeName string, commentCount int) map[string]any {
	out := copyMap(post)
	display := MapDisplayType(post)
	days := DaysAgo(strVal(post["created_at"]), time.Now())
	author, _ := post["author"].(map[string]any)
	level := 0
	certified := false
	if author != nil {
		level = int(asFloat(author["level"]))
		certified, _ = author["is_certified_leader"].(bool)
	}
	trust := "普通用户"
	if certified {
		trust = "认证领队"
	} else if level >= 8 {
		trust = "资深完赛者"
	} else if level >= 5 {
		trust = "有经验驴友"
	}

	summary := strVal(post["decision_summary"])
	if summary == "" {
		switch display {
		case "companion":
			summary = "约伴意向：同路线同行，评论区接洽"
		case "question":
			summary = "求具体建议：难度是否匹配、季节与补给信号如何"
		case "condition":
			summary = "近期路况核实，出发前请对照自身体能与天气"
		case "guide":
			summary = "可执行攻略：含行程节点与装备参考，可对照清单"
		default:
			summary = "完赛体验分享，注意核对发帖时间"
		}
	}

	hasLeader := asBool(post["has_leader_reply"]) || (strVal(post["type"]) == "question" && commentCount >= 10)
	answered := true
	if v, ok := post["answered"].(bool); ok {
		answered = v
	} else if strVal(post["type"]) == "question" {
		answered = hasLeader
	}

	out["comments"] = post["comments"]
	if commentCount > 0 {
		out["comments"] = commentCount
	} else if out["comments"] == nil {
		out["comments"] = 0
	}
	out["display_type"] = display
	out["type_label"] = TypeLabel(display)
	if routeName != "" {
		out["route_name"] = routeName
	} else {
		out["route_name"] = nil
	}
	out["decision_summary"] = summary
	out["freshness_label"] = FreshnessLabel(days)
	out["is_stale"] = days > 90
	out["trust_label"] = trust
	out["has_leader_reply"] = hasLeader
	out["answered"] = answered
	return out
}

// BuildCommunityBoard 与 Express buildCommunityBoard 字段对齐
func BuildCommunityBoard(
	posts []map[string]any,
	leaders []map[string]any,
	routeNames map[string]string,
	commentCounts map[string]int,
	focusRouteID, tripRouteID, tripID, tripRouteName string,
) map[string]any {
	enriched := make([]map[string]any, 0, len(posts))
	for _, p := range posts {
		rid := strVal(p["route_id"])
		pid := strVal(p["id"])
		enriched = append(enriched, EnrichCommunityPost(p, routeNames[rid], commentCounts[pid]))
	}

	focusID := focusRouteID
	if focusID == "" {
		focusID = tripRouteID
	}
	focusName := ""
	if focusID != "" {
		focusName = routeNames[focusID]
	}

	byCreated := func(a, b map[string]any) bool {
		return strVal(a["created_at"]) > strVal(b["created_at"])
	}

	conditions := filterPosts(enriched, func(p map[string]any) bool {
		return strVal(p["display_type"]) == "condition" && strVal(p["route_id"]) != ""
	}, byCreated, 5)

	guides := filterPosts(enriched, func(p map[string]any) bool {
		return strVal(p["display_type"]) == "guide"
	}, func(a, b map[string]any) bool {
		aa, _ := a["author"].(map[string]any)
		ba, _ := b["author"].(map[string]any)
		ac, bc := asBool(aa["is_certified_leader"]), asBool(ba["is_certified_leader"])
		if ac != bc {
			return ac && !bc
		}
		return byCreated(a, b)
	}, 4)

	companionsAll := filterPosts(enriched, func(p map[string]any) bool {
		return strVal(p["display_type"]) == "companion"
	}, byCreated, 0)

	companions := companionsAll
	if focusID != "" {
		companions = filterPosts(companionsAll, func(p map[string]any) bool {
			return strVal(p["route_id"]) == focusID
		}, byCreated, 8)
	} else if len(companions) > 6 {
		companions = companions[:6]
	}

	companionsTotal := 0
	for _, p := range companionsAll {
		if focusID == "" || strVal(p["route_id"]) == focusID {
			companionsTotal++
		}
	}

	var tripRelated []map[string]any
	if tripRouteID != "" {
		tripRelated = filterPosts(enriched, func(p map[string]any) bool {
			return strVal(p["route_id"]) == tripRouteID && strVal(p["display_type"]) != "companion"
		}, byCreated, 4)
	}
	if tripRelated == nil {
		tripRelated = []map[string]any{}
	}

	openQuestions := filterPosts(enriched, func(p map[string]any) bool {
		return strVal(p["display_type"]) == "question"
	}, func(a, b map[string]any) bool {
		score := func(p map[string]any) int {
			s := 0
			if asBool(p["has_leader_reply"]) {
				s += 2
			}
			if !asBool(p["answered"]) {
				s++
			}
			return s
		}
		if score(a) != score(b) {
			return score(a) > score(b)
		}
		return byCreated(a, b)
	}, 4)

	leaderCards := make([]map[string]any, 0, len(leaders))
	for _, l := range leaders {
		cp := copyMap(l)
		stats, _ := l["stats"].(map[string]any)
		acc := asFloat(stats["accident_rate"])
		trips := int(asFloat(stats["total_trips"]))
		rating := asFloat(stats["avg_rating"])
		if acc == 0 {
			cp["highlight"] = "零事故 · " + itoa(trips) + " 次带队"
		} else {
			cp["highlight"] = itoa(trips) + " 次带队 · 评分 " + format1(rating)
		}
		leaderCards = append(leaderCards, cp)
	}

	tagCount := map[string]int{}
	for _, p := range enriched {
		if tags, ok := p["tags"].([]any); ok {
			for _, t := range tags {
				tag := strVal(t)
				if tag == "" || len([]rune(tag)) > 12 {
					continue
				}
				tagCount[tag]++
			}
		}
		if rn := strVal(p["route_name"]); rn != "" {
			tagCount[rn] += 2
		}
	}
	type kv struct {
		k string
		v int
	}
	tags := make([]kv, 0, len(tagCount))
	for k, v := range tagCount {
		tags = append(tags, kv{k, v})
	}
	sort.Slice(tags, func(i, j int) bool { return tags[i].v > tags[j].v })
	hotTags := make([]string, 0, 10)
	for i, t := range tags {
		if i >= 10 {
			break
		}
		hotTags = append(hotTags, t.k)
	}

	searchHints := []string{}
	if focusName != "" {
		searchHints = append(searchHints, focusName+" 约伴")
	}
	searchHints = append(searchHints, "路况", "约伴", "新手", "徽杭古道", "紫金山")

	var focusIDOut, focusNameOut, tripRouteOut, tripNameOut, tripIDOut any
	if focusID != "" {
		focusIDOut, focusNameOut = focusID, focusName
	}
	if tripRouteID != "" {
		tripRouteOut, tripNameOut = tripRouteID, tripRouteName
	}
	if tripID != "" {
		tripIDOut = tripID
	}

	return map[string]any{
		"intro":            "精选路况、约伴、攻略与认证领队——帮你验证能不能走、找谁一起走",
		"trip_route_id":    tripRouteOut,
		"trip_route_name":  tripNameOut,
		"trip_id":          tripIDOut,
		"focus_route_id":   focusIDOut,
		"focus_route_name": focusNameOut,
		"companions":       companions,
		"companions_total": companionsTotal,
		"conditions":       conditions,
		"leaders":          leaderCards,
		"trip_related":     tripRelated,
		"guides":           guides,
		"open_questions":   openQuestions,
		"hot_tags":         hotTags,
		"search_hints":     searchHints,
	}
}

func filterPosts(
	in []map[string]any,
	pred func(map[string]any) bool,
	less func(a, b map[string]any) bool,
	limit int,
) []map[string]any {
	out := make([]map[string]any, 0)
	for _, p := range in {
		if pred(p) {
			out = append(out, p)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return less(out[i], out[j]) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}
