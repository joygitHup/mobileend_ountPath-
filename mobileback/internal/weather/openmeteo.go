package weather

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"mountpath/mobileback/internal/domain"
)

// Client fetches live weather; falls back to domain.DefaultWeather on failure.
type Client struct {
	Lat, Lng float64
	HTTP     *http.Client

	mu     sync.Mutex
	cache  domain.WeatherBrief
	at     time.Time
	byLoc  map[string]cachedBrief
}

type cachedBrief struct {
	w  domain.WeatherBrief
	at time.Time
}

func New(lat, lng float64) *Client {
	return &Client{
		Lat: lat, Lng: lng,
		HTTP:  &http.Client{Timeout: 4 * time.Second},
		byLoc: map[string]cachedBrief{},
	}
}

func (c *Client) Brief() domain.WeatherBrief {
	return c.BriefAt(c.Lat, c.Lng)
}

func locKey(lat, lng float64) string {
	return fmt.Sprintf("%.2f,%.2f", lat, lng)
}

func (c *Client) BriefAt(lat, lng float64) domain.WeatherBrief {
	if lat == 0 && lng == 0 {
		lat, lng = c.Lat, c.Lng
	}
	key := locKey(lat, lng)
	c.mu.Lock()
	defer c.mu.Unlock()
	if key == locKey(c.Lat, c.Lng) && time.Since(c.at) < 10*time.Minute && c.cache.Condition != "" {
		return c.cache
	}
	if hit, ok := c.byLoc[key]; ok && time.Since(hit.at) < 10*time.Minute {
		return hit.w
	}
	w, err := c.fetchAt(lat, lng)
	if err != nil {
		if key == locKey(c.Lat, c.Lng) && c.cache.Condition != "" {
			return c.cache
		}
		if hit, ok := c.byLoc[key]; ok {
			return hit.w
		}
		return domain.DefaultWeather()
	}
	c.byLoc[key] = cachedBrief{w: w, at: time.Now()}
	if key == locKey(c.Lat, c.Lng) {
		c.cache = w
		c.at = time.Now()
	}
	return w
}

func (c *Client) fetch() (domain.WeatherBrief, error) {
	return c.fetchAt(c.Lat, c.Lng)
}

func (c *Client) fetchAt(lat, lng float64) (domain.WeatherBrief, error) {
	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%%2FShanghai",
		lat, lng,
	)
	res, err := c.HTTP.Get(url)
	if err != nil {
		return domain.WeatherBrief{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return domain.WeatherBrief{}, fmt.Errorf("open-meteo status %d", res.StatusCode)
	}
	var raw struct {
		Current struct {
			Temp      float64 `json:"temperature_2m"`
			Code      int     `json:"weather_code"`
			WindSpeed float64 `json:"wind_speed_10m"`
		} `json:"current"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return domain.WeatherBrief{}, err
	}
	cond := wmoCondition(raw.Current.Code)
	wind := windLabel(raw.Current.WindSpeed)
	suitable, advice := adviceFor(raw.Current.Code, raw.Current.Temp, raw.Current.WindSpeed)
	return domain.WeatherBrief{
		Condition:     cond,
		TempC:         int(raw.Current.Temp + 0.5),
		Wind:          wind,
		Advice:        advice,
		SuitableLabel: suitable,
		IsFallback:    false,
		Source:        "live",
	}, nil
}

func wmoCondition(code int) string {
	switch {
	case code == 0:
		return "晴"
	case code <= 3:
		return "多云"
	case code <= 48:
		return "雾"
	case code <= 57:
		return "毛毛雨"
	case code <= 67:
		return "雨"
	case code <= 77:
		return "雪"
	case code <= 82:
		return "阵雨"
	case code <= 99:
		return "雷暴"
	default:
		return "多云"
	}
}

func windLabel(kmh float64) string {
	switch {
	case kmh < 5:
		return "微风"
	case kmh < 20:
		return "轻风"
	case kmh < 40:
		return "中风"
	default:
		return "大风"
	}
}

func adviceFor(code int, temp, wind float64) (suitable, advice string) {
	if code >= 95 {
		return "不建议出行", "有雷暴风险，暂缓进山；已在途中请尽快下撤到安全点"
	}
	if code >= 80 || wind >= 40 {
		return "谨慎出行", "阵雨或风力偏大，缩短行程并避开山脊与暴露段"
	}
	if temp >= 33 {
		return "谨慎出行", "高温湿热，早出早归，加强补水防晒"
	}
	if temp <= 0 {
		return "谨慎出行", "低温风险，注意防滑与保暖装备"
	}
	if code >= 61 {
		return "谨慎出行", "有雨，路面湿滑，优先缓坡路线并携带雨具"
	}
	return "适宜出行", "天气总体可走，仍请出发前核对局地短临预报与山路封闭信息"
}
