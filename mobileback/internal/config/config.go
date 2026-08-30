package config

import (
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	SeedsDir      string
	DemoOTP       string
	UploadDir     string
	PublicBaseURL string
	MapTileCDN    string
	NotifyMode    string
	WeatherLat    float64
	WeatherLng    float64
}

func Load() Config {
	cwd, _ := os.Getwd()
	defaultDB := filepath.Join(cwd, "data", "mountpath.db")
	upload := filepath.Join(cwd, "data", "uploads")
	return Config{
		Port:          getenv("PORT", "9092"),
		DatabaseURL:   getenv("DATABASE_URL", "sqlite://"+defaultDB),
		JWTSecret:     getenv("JWT_SECRET", "mountpath-dev-secret-change-me"),
		SeedsDir:      getenv("SEEDS_DIR", filepath.Join(cwd, "seeds")),
		DemoOTP:       getenv("DEMO_OTP", "1234"),
		UploadDir:     getenv("UPLOAD_DIR", upload),
		PublicBaseURL: getenv("PUBLIC_BASE_URL", "http://127.0.0.1:9092"),
		MapTileCDN:    getenv("MAP_TILE_CDN", ""),
		NotifyMode:    getenv("NOTIFY_MODE", "demo"),
		WeatherLat:    getenvFloat("WEATHER_LAT", 30.25),
		WeatherLng:    getenvFloat("WEATHER_LNG", 118.15),
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getenvFloat(k string, def float64) float64 {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return def
	}
	return f
}
