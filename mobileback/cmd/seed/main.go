package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"mountpath/mobileback/internal/config"
	"mountpath/mobileback/internal/db"
	"mountpath/mobileback/internal/seed"
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

	seedsDir := cfg.SeedsDir
	if seedsDir == "" {
		seedsDir = filepath.Join("seeds")
	}
	if err := seed.Run(database, seedsDir); err != nil {
		log.Fatalf("seed: %v", err)
	}

	// write marker for debugging
	_ = os.WriteFile(filepath.Join(seedsDir, ".seeded"), []byte("{}"), 0644)
	b, _ := json.MarshalIndent(map[string]string{"status": "ok", "db": cfg.DatabaseURL}, "", "  ")
	log.Println(string(b))
	log.Println("seed completed")
}
