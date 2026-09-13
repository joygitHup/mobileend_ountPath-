package db

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type User struct {
	ID               string `gorm:"primaryKey;size:64"`
	Phone            string `gorm:"uniqueIndex;size:32"`
	Name             string `gorm:"size:128"`
	AvatarURL        string `gorm:"size:1024"`
	Bio              string `gorm:"size:1024"`
	Verified         bool
	VerifiedLabel    string `gorm:"size:64"`
	Level            int
	TotalDistance    float64
	TotalTrips       int
	TotalElev        int
	SafetyScore      int
	Role             string `gorm:"size:16;default:user"` // user | ops | admin
	Banned           bool
	CommunitySeenAt  *time.Time // 上次进入社区时间，用于新帖红点
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type Route struct {
	ID       string `gorm:"primaryKey;size:64"`
	Payload  string `gorm:"type:text"` // full RouteItem JSON
	Name     string `gorm:"index;size:256"`
	Province string `gorm:"index;size:64"`
	Difficulty string `gorm:"size:32"`
	MatchScore int
}

type RouteDetailExtra struct {
	RouteID string `gorm:"primaryKey;size:64"`
	Payload string `gorm:"type:text"` // enrichRouteDetail extras JSON
}

type TrackBundle struct {
	RouteID string `gorm:"primaryKey;size:64"`
	Payload string `gorm:"type:text"` // summarizeTracks JSON
}

type Post struct {
	ID        string `gorm:"primaryKey;size:64"`
	UserID    string `gorm:"index;size:64"`
	Payload   string `gorm:"type:text"` // CommunityPost JSON
	Type      string `gorm:"index;size:32"`
	RouteID   *string `gorm:"index;size:64"`
	Hidden    bool   `gorm:"index"` // 运营隐藏后 C 端不展示
	CreatedAt time.Time
}

type Leader struct {
	ID      string `gorm:"primaryKey;size:64"`
	Payload string `gorm:"type:text"`
}

type Comment struct {
	ID        string `gorm:"primaryKey;size:64"`
	PostID    string `gorm:"index;size:64"`
	UserID    string `gorm:"index;size:64"`
	Payload   string `gorm:"type:text"`
	CreatedAt time.Time
}

// AppNotification 站内消息（评论回复等）
type AppNotification struct {
	ID         string `gorm:"primaryKey;size:64"`
	UserID     string `gorm:"index;size:64"` // 接收者
	ActorID    string `gorm:"size:64"`
	ActorName  string `gorm:"size:128"`
	Type       string `gorm:"size:48"` // comment_reply | post_comment | post_like | companion_join | question_leader_reply …
	Title      string `gorm:"size:256"`
	Body       string `gorm:"size:1024"`
	PostID     string `gorm:"size:64"`
	CommentID  string `gorm:"size:64"`
	Read       bool   `gorm:"index"`
	CreatedAt  time.Time
}

// CompanionInterest 约伴「想加入 / +1」
type CompanionInterest struct {
	UserID    string `gorm:"primaryKey;size:64"`
	PostID    string `gorm:"primaryKey;size:64;index"`
	Note      string `gorm:"size:512"`
	CreatedAt time.Time
}

type Favorite struct {
	UserID    string `gorm:"primaryKey;size:64"`
	RouteID   string `gorm:"primaryKey;size:64"`
	CreatedAt time.Time
}

// PostLike 帖子点赞
type PostLike struct {
	UserID    string `gorm:"primaryKey;size:64"`
	PostID    string `gorm:"primaryKey;size:64;index"`
	CreatedAt time.Time
}

// CommentLike 评论点赞
type CommentLike struct {
	UserID    string `gorm:"primaryKey;size:64"`
	CommentID string `gorm:"primaryKey;size:64;index"`
	CreatedAt time.Time
}

type Trip struct {
	ID                   string `gorm:"primaryKey;size:64"`
	UserID               string `gorm:"index;size:64"`
	RouteID              string `gorm:"index;size:64"`
	Status               string `gorm:"index;size:32"` // planned|active|completed
	DepartureAt          time.Time
	PlannedDurationHours int
	GuardiansJSON        string `gorm:"type:text"`
	ItemsJSON            string `gorm:"type:text"`
	GuardSessionID       *string
	DisclaimerAcceptedAt *time.Time
	CompletedAt          *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type GuardSession struct {
	ID                   string `gorm:"primaryKey;size:64"`
	UserID               string `gorm:"index;size:64"`
	RouteID              string `gorm:"size:64"`
	TripID               *string
	Status               string `gorm:"size:32"`
	StartedAt            time.Time
	PlannedDurationHours int
	GuardiansJSON        string     `gorm:"type:text"`
	LastLocationJSON     string     `gorm:"type:text"`
	OvertimeNotifiedAt   *time.Time // 超时已通知紧急联系人（演示）
}

type EmergencyContact struct {
	ID        string `gorm:"primaryKey;size:64"`
	UserID    string `gorm:"index;size:64"`
	Name      string `gorm:"size:64"`
	Phone     string `gorm:"size:32"`
	IsPrimary bool
	CreatedAt time.Time
}

type SafetySettings struct {
	UserID               string `gorm:"primaryKey;size:64"`
	DepartureRemindHours int
	RemindWeather        bool
	RemindChecklist      bool
	RemindRouteRisk      bool
	SatelliteDeviceID    *string
	SatelliteBound        bool
	LastSosJSON          string `gorm:"type:text"` // 最近一次 SOS 摘要（演示通知结果）
}

type ToolItem struct {
	ID      string `gorm:"primaryKey;size:64"`
	Payload string `gorm:"type:text"`
}

type ChecklistTemplate struct {
	ID      string `gorm:"primaryKey;size:64"` // difficulty key: easy|moderate|hard|expert|base
	Payload string `gorm:"type:text"`
}

// CompletedRoute 完赛记录（行程关闭后仍保留，用于个人统计）
type CompletedRoute struct {
	ID             string `gorm:"primaryKey;size:64"`
	UserID         string `gorm:"index;size:64"`
	RouteID        string `gorm:"index;size:64"`
	RouteName      string `gorm:"size:256"`
	DistanceKm     float64
	ElevationGainM int
	DurationHours  float64
	CompletedAt    time.Time
}

// WalkSession 一次轨迹步行会话（进度 / 选用轨迹）
type WalkSession struct {
	ID        string `gorm:"primaryKey;size:64"`
	UserID    string `gorm:"index;size:64"`
	RouteID   string `gorm:"index;size:64"`
	TrackID   string `gorm:"size:64"`
	Progress  float64
	OffsetM   float64
	Status    string `gorm:"index;size:32;default:active"` // active|ended
	StartedAt time.Time
	UpdatedAt time.Time
	EndedAt   *time.Time
}

// WalkAnnotation 步行会话草稿标注；发布后写入 PublishedTrack
type WalkAnnotation struct {
	ID         string `gorm:"primaryKey;size:64"`
	SessionID  string `gorm:"index;size:64"`
	RouteID    string `gorm:"index;size:64"`
	UserID     string `gorm:"index;size:64"`
	Kind       string `gorm:"size:32"`
	Title      string `gorm:"size:128"`
	Note       string `gorm:"type:text"`
	Progress   float64
	DistanceKm float64
	AltitudeM  *float64
	Author     string `gorm:"size:64"`
	CreatedAt  time.Time
}

// PublishedTrack 完整轨迹（含 annotations），社区发布落库
type PublishedTrack struct {
	ID          string `gorm:"primaryKey;size:64"`
	RouteID     string `gorm:"index;size:64"`
	IsOfficial  bool
	Recommended bool
	Hidden      bool // 审核隐藏
	Payload     string `gorm:"type:text"` // full track JSON
}

// AdminAuditLog 管理台操作审计
type AdminAuditLog struct {
	ID         string    `gorm:"primaryKey;size:64" json:"id"`
	ActorID    string    `gorm:"index;size:64" json:"actor_id"`
	ActorPhone string    `gorm:"size:32" json:"actor_phone"`
	Action     string    `gorm:"index;size:64" json:"action"` // create_route | hide_post | …
	Resource   string    `gorm:"size:64" json:"resource"`
	ResourceID string    `gorm:"size:64" json:"resource_id"`
	Detail     string    `gorm:"type:text" json:"detail"`
	CreatedAt  time.Time `json:"created_at"`
}

// LegalDoc 合规文案（隐私政策 / 用户协议等）
type LegalDoc struct {
	ID        string `gorm:"primaryKey;size:64"` // privacy | terms
	Title     string `gorm:"size:256"`
	UpdatedAt string `gorm:"size:32"`
	Payload   string `gorm:"type:text"` // sections JSON
}

// CampPoint 营地 POI（原 handler 硬编码，现可运营）
type CampPoint struct {
	ID      string `gorm:"primaryKey;size:64"`
	Payload string `gorm:"type:text"`
}

// SignalPoint 信号点 POI
type SignalPoint struct {
	ID      string `gorm:"primaryKey;size:64"`
	Payload string `gorm:"type:text"`
}

func Open(databaseURL string) (*gorm.DB, error) {
	path := databaseURL
	if strings.HasPrefix(databaseURL, "sqlite://") {
		path = strings.TrimPrefix(databaseURL, "sqlite://")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	gdb, err := gorm.Open(sqlite.Open(path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("sqlite open %s: %w", path, err)
	}
	return gdb, nil
}

func AutoMigrate(gdb *gorm.DB) error {
	return gdb.AutoMigrate(
		&User{},
		&Route{},
		&RouteDetailExtra{},
		&TrackBundle{},
		&Post{},
		&Leader{},
		&Comment{},
		&AppNotification{},
		&CompanionInterest{},
		&Favorite{},
		&PostLike{},
		&CommentLike{},
		&Trip{},
		&GuardSession{},
		&EmergencyContact{},
		&SafetySettings{},
		&ToolItem{},
		&ChecklistTemplate{},
		&WalkSession{},
		&WalkAnnotation{},
		&PublishedTrack{},
		&CompletedRoute{},
		&AdminAuditLog{},
		&LegalDoc{},
		&CampPoint{},
		&SignalPoint{},
	)
}
