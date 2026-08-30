package main

import (
	"log"

	"mountpath/mobileback/internal/config"
	"mountpath/mobileback/internal/db"
	"mountpath/mobileback/internal/httpapi"
)

func main() {
	cfg := config.Load()
	database, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	// 演示环境：确保种子管理员具备 admin 角色（无需强制 re-seed）
	_ = database.Model(&db.User{}).Where("phone = ?", "13800000000").Update("role", "admin").Error

	r := httpapi.NewRouter(database, cfg)
	addr := ":" + cfg.Port
	log.Printf("mobileback listening on http://localhost%s (db=%s)", addr, cfg.DatabaseURL)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}
