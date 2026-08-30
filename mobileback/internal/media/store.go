package media

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	Dir         string
	PublicBase  string // http://host:port
}

func New(dir, publicBase string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{Dir: dir, PublicBase: strings.TrimRight(publicBase, "/")}, nil
}

func (s *Store) Save(r io.Reader, ext string) (publicURL, relPath string, err error) {
	ext = strings.ToLower(ext)
	if ext == "" {
		ext = ".jpg"
	}
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic":
	default:
		ext = ".jpg"
	}
	day := time.Now().Format("20060102")
	name := uuid.NewString()[:12] + ext
	rel := filepath.ToSlash(filepath.Join(day, name))
	absDir := filepath.Join(s.Dir, day)
	if err = os.MkdirAll(absDir, 0o755); err != nil {
		return "", "", err
	}
	abs := filepath.Join(absDir, name)
	f, err := os.Create(abs)
	if err != nil {
		return "", "", err
	}
	defer f.Close()
	if _, err = io.Copy(f, r); err != nil {
		return "", "", err
	}
	publicURL = fmt.Sprintf("%s/api/v1/media/%s", s.PublicBase, rel)
	return publicURL, rel, nil
}

func (s *Store) AbsPath(rel string) (string, error) {
	rel = filepath.Clean("/" + rel)
	rel = strings.TrimPrefix(rel, "/")
	if strings.Contains(rel, "..") {
		return "", fmt.Errorf("invalid path")
	}
	abs := filepath.Join(s.Dir, rel)
	if !strings.HasPrefix(abs, filepath.Clean(s.Dir)+string(os.PathSeparator)) && abs != filepath.Clean(s.Dir) {
		return "", fmt.Errorf("invalid path")
	}
	return abs, nil
}
