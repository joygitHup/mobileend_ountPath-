package seed

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"mountpath/mobileback/internal/db"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func Run(gdb *gorm.DB, seedsDir string) error {
	routesPath := filepath.Join(seedsDir, "routes.json")
	if _, err := os.Stat(routesPath); err != nil {
		return fmt.Errorf("missing %s — edit/add JSON under mobileback/seeds/", routesPath)
	}

	if err := loadRoutes(gdb, routesPath); err != nil {
		return err
	}
	_ = loadJSONFile(gdb, filepath.Join(seedsDir, "route_details.json"), func(id string, raw json.RawMessage) error {
		return gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.RouteDetailExtra{RouteID: id, Payload: string(raw)}).Error
	})
	_ = loadJSONFile(gdb, filepath.Join(seedsDir, "tracks.json"), func(id string, raw json.RawMessage) error {
		return gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.TrackBundle{RouteID: id, Payload: string(raw)}).Error
	})
	if err := loadPosts(gdb, filepath.Join(seedsDir, "posts.json")); err != nil {
		return err
	}
	if err := loadLeaders(gdb, filepath.Join(seedsDir, "leaders.json")); err != nil {
		return err
	}
	_ = loadArray(gdb, filepath.Join(seedsDir, "tools.json"), func(item map[string]any) error {
		id, _ := item["id"].(string)
		b, _ := json.Marshal(item)
		return gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.ToolItem{ID: id, Payload: string(b)}).Error
	})
	_ = loadNamed(gdb, filepath.Join(seedsDir, "checklist_templates.json"))

	// demo user
	now := time.Now()
	u := db.User{
		ID: "u1", Phone: "13800000000", Name: "山途旅人",
		AvatarURL: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80",
		Bio: "喜欢山脊线上的风，出发前先问山途。", Verified: false, VerifiedLabel: "未实名",
		Level: 5, TotalDistance: 128.5, TotalTrips: 12, TotalElev: 8600, SafetyScore: 78,
		Role: "admin",
		CreatedAt: now, UpdatedAt: now,
	}
	if err := gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&u).Error; err != nil {
		return err
	}
	settings := db.SafetySettings{
		UserID: u.ID, DepartureRemindHours: 12,
		RemindWeather: true, RemindChecklist: true, RemindRouteRisk: true,
	}
	_ = gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&settings).Error
	contact := db.EmergencyContact{
		ID: "ec1", UserID: u.ID, Name: "家人", Phone: "13900001111", IsPrimary: true, CreatedAt: now,
	}
	_ = gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&contact).Error

	// default legal docs (ops can override via admin)
	privacySections, _ := json.Marshal([]map[string]any{
		{"heading": "一、我们收集的信息", "body": []string{"账号信息、位置信息、相册与相机、设备与日志等。"}},
		{"heading": "二、我们如何使用信息", "body": []string{"提供选路、行程、守护与社区功能；SOS 时通知紧急联系人。"}},
	})
	_ = gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.LegalDoc{
		ID: "privacy", Title: "隐私政策", UpdatedAt: "2026-08-30", Payload: string(privacySections),
	}).Error
	termsSections, _ := json.Marshal([]map[string]any{
		{"heading": "一、服务说明", "body": []string{"山途提供徒步决策与安全保障相关功能，户外风险需自行评估。"}},
		{"heading": "二、用户义务", "body": []string{"如实填写资料，遵守社区规范，不发布违法或危险内容。"}},
	})
	_ = gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.LegalDoc{
		ID: "terms", Title: "用户协议", UpdatedAt: "2026-08-30", Payload: string(termsSections),
	}).Error

	return nil
}

func loadRoutes(gdb *gorm.DB, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var list []map[string]any
	if err := json.Unmarshal(raw, &list); err != nil {
		return err
	}
	for _, item := range list {
		id, _ := item["id"].(string)
		name, _ := item["name"].(string)
		province, _ := item["province"].(string)
		diff, _ := item["difficulty"].(string)
		match := 0
		if v, ok := item["match_score"].(float64); ok {
			match = int(v)
		}
		b, _ := json.Marshal(item)
		rec := db.Route{ID: id, Payload: string(b), Name: name, Province: province, Difficulty: diff, MatchScore: match}
		if err := gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&rec).Error; err != nil {
			return err
		}
	}
	return nil
}

func loadPosts(gdb *gorm.DB, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var list []map[string]any
	if err := json.Unmarshal(raw, &list); err != nil {
		return err
	}
	for _, item := range list {
		id, _ := item["id"].(string)
		typ, _ := item["type"].(string)
		var routeID *string
		if r, ok := item["route_id"].(string); ok && r != "" {
			routeID = &r
		}
		created := time.Now()
		if s, ok := item["created_at"].(string); ok {
			if t, e := time.Parse(time.RFC3339, s); e == nil {
				created = t
			}
		}
		b, _ := json.Marshal(item)
		rec := db.Post{ID: id, UserID: "u1", Payload: string(b), Type: typ, RouteID: routeID, CreatedAt: created}
		if err := gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&rec).Error; err != nil {
			return err
		}
	}
	return nil
}

func loadLeaders(gdb *gorm.DB, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var list []map[string]any
	if err := json.Unmarshal(raw, &list); err != nil {
		return err
	}
	for _, item := range list {
		id, _ := item["id"].(string)
		b, _ := json.Marshal(item)
		if err := gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.Leader{ID: id, Payload: string(b)}).Error; err != nil {
			return err
		}
	}
	return nil
}

func loadJSONFile(gdb *gorm.DB, path string, fn func(id string, raw json.RawMessage) error) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return err
	}
	for id, v := range m {
		if err := fn(id, v); err != nil {
			return err
		}
	}
	return nil
}

func loadArray(gdb *gorm.DB, path string, fn func(map[string]any) error) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var list []map[string]any
	if err := json.Unmarshal(raw, &list); err != nil {
		return err
	}
	for _, item := range list {
		if err := fn(item); err != nil {
			return err
		}
	}
	return nil
}

func loadNamed(gdb *gorm.DB, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return err
	}
	for id, v := range m {
		if err := gdb.Clauses(clause.OnConflict{UpdateAll: true}).Create(&db.ChecklistTemplate{ID: id, Payload: string(v)}).Error; err != nil {
			return err
		}
	}
	return nil
}
