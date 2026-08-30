package domain

import (
	"encoding/json"
	"sort"
	"time"
)

type WeatherBrief struct {
	Condition     string `json:"condition"`
	TempC         int    `json:"temp_c"`
	Wind          string `json:"wind"`
	Advice        string `json:"advice"`
	SuitableLabel string `json:"suitable_label"`
	IsFallback    bool   `json:"is_fallback"`
	Source        string `json:"source"` // live | fallback
}

/** MatchProfile 用于按用户体能/履历重算匹配度 */
type MatchProfile struct {
	Level         int
	TotalDistance float64
	TotalTrips    int
	TotalElev     int
	SafetyScore   int
	FavoriteIDs   map[string]bool
	CompletedIDs  map[string]bool
}

func DefaultWeather() WeatherBrief {
	return WeatherBrief{
		Condition:     "多云",
		TempC:         28,
		Wind:          "微风",
		Advice:        "夏末湿热，优先短途与低海拔；午后雷阵雨概率偏高，早出早归（离线示意天气，非实况）",
		SuitableLabel: "谨慎出行",
		IsFallback:    true,
		Source:        "fallback",
	}
}

func CurrentSeason(t time.Time) string {
	m := int(t.Month())
	switch {
	case m >= 3 && m <= 5:
		return "春"
	case m >= 6 && m <= 8:
		return "夏"
	case m >= 9 && m <= 11:
		return "秋"
	default:
		return "冬"
	}
}

/** ProvinceApproxCoords 省份示意坐标（用于局地天气，非精确点） */
func ProvinceApproxCoords(province string) (lat, lng float64, ok bool) {
	m := map[string][2]float64{
		"安徽": {30.25, 118.15},
		"浙江": {30.25, 119.70},
		"江西": {28.68, 115.86},
		"云南": {25.04, 102.71},
		"江苏": {32.06, 118.80},
		"广东": {23.13, 113.26},
		"四川": {30.57, 104.07},
		"西藏": {29.65, 91.12},
		"青海": {36.62, 101.78},
		"新疆": {43.83, 87.62},
		"北京": {40.22, 116.23},
		"河北": {38.04, 114.51},
	}
	if v, hit := m[province]; hit {
		return v[0], v[1], true
	}
	return 0, 0, false
}

func EnrichRoute(route map[string]any, season string) map[string]any {
	return EnrichRouteForUser(route, season, nil)
}

func EnrichRouteForUser(route map[string]any, season string, profile *MatchProfile) map[string]any {
	out := cloneMap(route)
	best, _ := route["best_season"].([]any)
	seasonFit := false
	for _, s := range best {
		if ss, ok := s.(string); ok && ss == season {
			seasonFit = true
			break
		}
	}
	diff, _ := route["difficulty"].(string)
	risk := riskLevelOf(route)
	out["decision_summary"] = decisionSummary(diff, season, seasonFit, best)
	out["risk_level"] = risk
	out["caution_reason"] = cautionReason(route, risk)
	out["key_checkpoint"] = keyCheckpoint(route)
	out["season_fit"] = seasonFit

	seedMatch := asInt(route["match_score"])
	match, reasons := computePersonalMatch(out, seasonFit, seedMatch, profile)
	out["match_score"] = match
	out["match_reasons"] = reasons
	out["match_personalized"] = profile != nil
	return out
}

func computePersonalMatch(route map[string]any, seasonFit bool, seed int, profile *MatchProfile) (int, []string) {
	reasons := []string{}
	diff, _ := route["difficulty"].(string)
	dist := asFloat(route["distance"])
	elev := asFloat(route["elevation_gain"])
	maxAlt := asFloat(route["max_altitude"])
	ratings, _ := route["ratings"].(map[string]any)
	climb := asInt(ratings["climb_intensity"])
	completion := asInt(route["completion_rate"])
	id, _ := route["id"].(string)

	score := 52
	if seed > 0 {
		// 种子分作弱先验，避免冷启动全靠规则
		score = 40 + seed/5
	}

	level := 3
	if profile != nil && profile.Level > 0 {
		level = profile.Level
	}

	switch diff {
	case "easy":
		if level <= 6 {
			score += 18
			reasons = append(reasons, "难度适合当前等级")
		} else {
			score += 8
			reasons = append(reasons, "轻松路线，可作为恢复日")
		}
	case "moderate":
		if level >= 3 && level <= 14 {
			score += 16
			reasons = append(reasons, "难度与体能较匹配")
		} else if level < 3 {
			score -= 6
			reasons = append(reasons, "对新手略有挑战")
		} else {
			score += 6
		}
	case "hard":
		if level >= 8 {
			score += 14
			reasons = append(reasons, "体能可支撑较难路线")
		} else {
			score -= 12
			reasons = append(reasons, "难度偏高，建议升级后再挑战")
		}
	case "expert":
		if level >= 12 {
			score += 10
			reasons = append(reasons, "高等级可评估专家线")
		} else {
			score -= 22
			reasons = append(reasons, "专家级，匹配偏低")
		}
	}

	if seasonFit {
		score += 10
		reasons = append(reasons, "正值适宜季节")
	} else {
		score -= 8
	}

	if profile != nil {
		if profile.TotalDistance < 30 && dist > 18 {
			score -= 10
			reasons = append(reasons, "里程偏长，建议先练短途")
		} else if profile.TotalDistance >= 80 && dist >= 12 {
			score += 4
		}
		if profile.TotalElev < 1500 && elev >= 1200 {
			score -= 8
		} else if profile.TotalElev >= 3000 && elev >= 600 {
			score += 3
		}
		if profile.SafetyScore >= 80 && asInt(route["turnaround_rate"]) <= 10 {
			score += 3
		}
		if profile.FavoriteIDs[id] {
			score += 10
			reasons = append(reasons, "来自你的收藏")
		}
		if profile.CompletedIDs[id] {
			score += 4
			reasons = append(reasons, "你曾完成过")
		}
	} else if seed >= 70 {
		reasons = append(reasons, "综合口碑与完赛数据较好")
	}

	if climb <= 5 {
		score += 4
		reasons = append(reasons, "爬升适中")
	} else if climb >= 8 {
		score -= 4
		if level < 10 {
			reasons = append(reasons, "爬升强度大")
		}
	}
	if asInt(ratings["signal_coverage"]) >= 7 {
		reasons = append(reasons, "信号较好")
	}
	if completion >= 90 {
		score += 3
	}
	if maxAlt >= 3000 && level < 10 {
		score -= 8
	}

	if score < 12 {
		score = 12
	}
	if score > 98 {
		score = 98
	}

	// 保证至少有一条匹配说明
	if len(reasons) == 0 {
		if score >= 70 {
			reasons = append(reasons, "与你当前体能较契合")
		} else if score >= 50 {
			reasons = append(reasons, "整体匹配尚可")
		} else {
			reasons = append(reasons, "匹配偏低，请谨慎选择")
		}
	}
	if len(reasons) > 3 {
		reasons = reasons[:3]
	}
	return score, reasons
}

func BuildDiscoverFeed(routes []map[string]any) map[string]any {
	return BuildDiscoverFeedWithWeather(routes, DefaultWeather(), nil)
}

func BuildDiscoverFeedWithWeather(routes []map[string]any, weather WeatherBrief, profile *MatchProfile) map[string]any {
	season := CurrentSeason(time.Now())
	enriched := make([]map[string]any, 0, len(routes))
	for _, r := range routes {
		enriched = append(enriched, EnrichRouteForUser(r, season, profile))
	}

	today := filterSort(enriched, func(r map[string]any) bool {
		risk, _ := r["risk_level"].(string)
		match := asInt(r["match_score"])
		return risk != "high" && match >= 55
	}, func(a, b map[string]any) bool {
		return todayScore(b, weather) < todayScore(a, weather)
	}, 3)

	matched := append([]map[string]any{}, enriched...)
	sort.Slice(matched, func(i, j int) bool {
		return asInt(matched[i]["match_score"]) > asInt(matched[j]["match_score"])
	})

	caution := filterSort(enriched, func(r map[string]any) bool {
		risk, _ := r["risk_level"].(string)
		return risk != "low" || asInt(r["turnaround_rate"]) >= 14
	}, func(a, b map[string]any) bool {
		return asInt(a["turnaround_rate"]) > asInt(b["turnaround_rate"])
	}, 3)

	seasonal := make([]map[string]any, 0)
	for _, r := range enriched {
		if fit, _ := r["season_fit"].(bool); fit {
			seasonal = append(seasonal, r)
		}
	}
	sort.Slice(seasonal, func(i, j int) bool {
		return asInt(seasonal[i]["match_score"]) > asInt(seasonal[j]["match_score"])
	})

	provinces := map[string]bool{}
	for _, r := range enriched {
		if p, _ := r["province"].(string); p != "" {
			provinces[p] = true
		}
	}
	provList := make([]string, 0, len(provinces))
	for p := range provinces {
		provList = append(provList, p)
	}
	sort.Strings(provList)

	return map[string]any{
		"weather":            weather,
		"current_season":     season,
		"today":              today,
		"matched":            matched,
		"caution":            caution,
		"seasonal":           seasonal,
		"filter_provinces":   provList,
		"match_personalized": profile != nil,
	}
}

func todayScore(r map[string]any, w WeatherBrief) int {
	score := asInt(r["match_score"])
	if fit, _ := r["season_fit"].(bool); fit {
		score += 8
	} else {
		score -= 12
	}
	risk, _ := r["risk_level"].(string)
	if risk == "high" {
		score -= 25
	}
	if risk == "medium" {
		score -= 10
	}
	dist := asFloat(r["distance"])
	if dist <= 12 && w.SuitableLabel != "适宜出行" {
		score += 6
	}
	maxAlt := asFloat(r["max_altitude"])
	if maxAlt >= 2500 && w.TempC >= 26 {
		score -= 8
	}
	diff, _ := r["difficulty"].(string)
	if diff == "easy" {
		score += 5
	}
	if w.SuitableLabel == "不建议出行" {
		score -= 15
	} else if w.SuitableLabel == "谨慎出行" {
		score -= 4
	}
	return score
}

func riskLevelOf(route map[string]any) string {
	ratings, _ := route["ratings"].(map[string]any)
	turn := asInt(route["turnaround_rate"])
	alt := asInt(ratings["altitude_risk"])
	sig := asInt(ratings["signal_coverage"])
	diff, _ := route["difficulty"].(string)
	if turn >= 20 || alt >= 5 || diff == "expert" {
		return "high"
	}
	if turn >= 12 || sig <= 4 || diff == "hard" {
		return "medium"
	}
	return "low"
}

func cautionReason(route map[string]any, risk string) any {
	if risk == "low" {
		return nil
	}
	parts := []string{}
	if asInt(route["turnaround_rate"]) >= 12 {
		parts = append(parts, "折返率偏高")
	}
	ratings, _ := route["ratings"].(map[string]any)
	if asInt(ratings["altitude_risk"]) >= 5 {
		parts = append(parts, "海拔风险偏高")
	}
	if asInt(ratings["signal_coverage"]) <= 3 {
		parts = append(parts, "多段无信号")
	}
	if len(parts) == 0 {
		return "风险偏高，请充分评估"
	}
	out := parts[0]
	for i := 1; i < len(parts); i++ {
		out += " · " + parts[i]
	}
	return out
}

func decisionSummary(diff, season string, seasonFit bool, best []any) string {
	label := map[string]string{
		"easy": "轻松入门", "moderate": "节奏友好", "hard": "体能要求高", "expert": "仅建议有经验者",
	}[diff]
	if label == "" {
		label = "需评估难度"
	}
	if seasonFit {
		return label + "，" + season + "季适宜"
	}
	seasons := ""
	for i, s := range best {
		if ss, ok := s.(string); ok {
			if i > 0 {
				seasons += "/"
			}
			seasons += ss
		}
	}
	if seasons != "" {
		return label + "，更适合" + seasons + "季"
	}
	return label + "，需核对季节"
}

func keyCheckpoint(route map[string]any) any {
	cps, _ := route["checkpoints"].([]any)
	for _, c := range cps {
		m, _ := c.(map[string]any)
		water, _ := m["has_water"].(bool)
		signal, _ := m["has_signal"].(bool)
		name, _ := m["name"].(string)
		if !water || !signal {
			miss := ""
			if !water {
				miss = "无水"
			}
			if !signal {
				if miss != "" {
					miss += "/"
				}
				miss += "无信号"
			}
			return name + "（" + miss + "）"
		}
	}
	if len(cps) > 0 {
		m, _ := cps[len(cps)/2].(map[string]any)
		return m["name"]
	}
	return nil
}

func asInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	default:
		return 0
	}
}

func cloneMap(m map[string]any) map[string]any {
	b, _ := json.Marshal(m)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out
}

func filterSort(in []map[string]any, keep func(map[string]any) bool, less func(a, b map[string]any) bool, limit int) []map[string]any {
	out := make([]map[string]any, 0)
	for _, r := range in {
		if keep(r) {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool { return less(out[i], out[j]) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}
