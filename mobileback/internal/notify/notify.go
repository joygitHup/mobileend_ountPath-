package notify

import (
	"fmt"
	"log"
	"time"
)

// SOSPayload 紧急求救通知
type SOSPayload struct {
	UserID    string
	UserName  string
	Phone     string
	Contacts  []Contact
	Lat, Lng  float64
	Message   string
	TrackURL  string
	Channel   string // sms | push | satellite
}

type Contact struct {
	Name  string
	Phone string
}

type Result struct {
	OK       bool     `json:"ok"`
	Mode     string   `json:"mode"`
	Channels []string `json:"channels"`
	Message  string   `json:"message"`
	At       string   `json:"notified_at"`
}

// Notifier 可替换：demo / log / 真短信网关
type Notifier interface {
	SendSOS(p SOSPayload) Result
	SendSMS(to, body string) error
}

type Demo struct{ Mode string }

func New(mode string) Notifier {
	if mode == "" {
		mode = "demo"
	}
	return &Demo{Mode: mode}
}

func (d *Demo) SendSOS(p SOSPayload) Result {
	chs := []string{"log"}
	msg := fmt.Sprintf(
		"[%s] SOS user=%s lat=%.5f lng=%.5f contacts=%d msg=%s",
		d.Mode, p.UserID, p.Lat, p.Lng, len(p.Contacts), p.Message,
	)
	log.Println(msg)
	for _, c := range p.Contacts {
		_ = d.SendSMS(c.Phone, fmt.Sprintf("【山途SOS】%s 发出求救：%s 位置(%.5f,%.5f) %s",
			p.UserName, p.Message, p.Lat, p.Lng, p.TrackURL))
		chs = append(chs, "sms:"+c.Phone)
	}
	if p.Channel == "satellite" || p.Channel == "all" {
		chs = append(chs, "satellite:queued")
		log.Printf("[notify] satellite SOS queued for user=%s (wire Beidou/Iridium SDK here)", p.UserID)
	}
	chs = append(chs, "push:queued")
	return Result{
		OK: true, Mode: d.Mode, Channels: chs,
		Message: "已记录求救并模拟通知紧急联系人（未接真短信/推送网关时不会真实下发）",
		At:      time.Now().Format(time.RFC3339),
	}
}

func (d *Demo) SendSMS(to, body string) error {
	log.Printf("[notify/%s] SMS → %s | %s", d.Mode, to, body)
	return nil
}
