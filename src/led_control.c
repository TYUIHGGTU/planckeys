/*
 * SPDX-License-Identifier: MIT
 *
 * planckeys self-developed WS2812 LED controller.
 *
 * 独占 zmk,underglow 指向的 WS2812 灯带（内建 ZMK underglow 必须关闭），
 * 提供：
 *   - 主机(WebHID/Raw HID, usage page 0xFF60) -> 键盘：**每颗独立基色画布**
 *     + 全局模式 / 亮度 / 速度；
 *   - 预设灯效在「每颗基色画布」之上做动画：常亮(solid) / 呼吸(breathing) /
 *     跑马(marquee) / 熔灭(fade) / 关灯(off)。因此配色方案（多色）也能整体
 *     一起呼吸 / 跑马，而不是被压成单一颜色；
 *   - keymap 里 &led_next 键循环切换上述预设（见 behavior_led_next.c）。
 *
 * 颜色只由「画布」决定，模式只决定动画；两者相互独立。
 *
 * 下行协议（主机 -> 键盘，32 字节 report，无 report id）：
 *   0xA1 CONFIG    : [1]=mode [2]=brightness [3]=speed   （只改动画，不动颜色）
 *   0xA2 PIXELS    : [1]=offset [2]=count, 之后每颗 3 字节 RGB  （写画布，不改模式）
 *   0xA3 BRIGHTNESS: [1]=brightness
 *   0xA4 FILL      : [1]=R [2]=G [3]=B                    （用单色铺满整块画布）
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/init.h>
#include <string.h>
#include <zephyr/drivers/led_strip.h>
#include <zephyr/logging/log.h>

#include <zmk/event_manager.h>
#include <raw_hid/events.h>

#if IS_ENABLED(CONFIG_ZMK_EXT_POWER)
#include <drivers/ext_power.h>
#endif

#include "planckeys_led.h"

LOG_MODULE_REGISTER(planckeys_led, CONFIG_ZMK_LOG_LEVEL);

#define STRIP_NODE DT_CHOSEN(zmk_underglow)

#if !DT_NODE_HAS_STATUS(STRIP_NODE, okay)
#error "planckeys-led-control: chosen zmk,underglow (led_strip) node not found/enabled"
#endif

#define LED_COUNT DT_PROP(STRIP_NODE, chain_length)

static const struct device *const strip = DEVICE_DT_GET(STRIP_NODE);

/* Raw HID opcodes (须与 tools/led-web 网页保持一致) */
#define CMD_CONFIG     0xA1
#define CMD_PIXELS     0xA2
#define CMD_BRIGHTNESS 0xA3
#define CMD_FILL       0xA4

enum led_mode {
	MODE_OFF = 0,
	MODE_SOLID = 1,
	MODE_BREATHING = 2,
	MODE_MARQUEE = 3,
	MODE_FADE = 4,
	MODE_COUNT
};

/* &led_next 循环顺序：常亮 -> 呼吸 -> 跑马 -> 熔灭 -> 关灯 -> ... */
static const enum led_mode preset_order[] = {
	MODE_SOLID, MODE_BREATHING, MODE_MARQUEE, MODE_FADE, MODE_OFF,
};

static struct {
	enum led_mode mode;
	uint8_t brightness; /* 0-255 全局亮度 */
	uint8_t speed;      /* 1-255 动画速度 */
	struct led_rgb base[LED_COUNT]; /* 每颗基色画布：颜色的唯一来源 */
} state;

static struct k_mutex lock;
static uint32_t phase;
static bool ready;

static inline uint8_t scale8(uint8_t v, uint8_t s)
{
	return (uint8_t)(((uint16_t)v * (uint16_t)s) / 255U);
}

/* 三角波：0 -> 254 -> 0 */
static inline uint8_t tri(uint8_t t)
{
	return (t < 128) ? (uint8_t)(t * 2) : (uint8_t)((255 - t) * 2);
}

/* out = base 各通道按 lvl 缩放 */
static inline void scale_px(struct led_rgb *out, const struct led_rgb *base, uint8_t lvl)
{
	out->r = scale8(base->r, lvl);
	out->g = scale8(base->g, lvl);
	out->b = scale8(base->b, lvl);
}

/* 计算一帧到 out[]（调用方持有 lock）。颜色取自 state.base[]，模式只决定亮度调制。 */
static void compute_frame(struct led_rgb *out)
{
	const uint8_t br = state.brightness;

	switch (state.mode) {
	case MODE_OFF:
		memset(out, 0, sizeof(struct led_rgb) * LED_COUNT);
		break;

	case MODE_SOLID:
		for (int i = 0; i < LED_COUNT; i++) {
			scale_px(&out[i], &state.base[i], br);
		}
		break;

	case MODE_BREATHING: {
		uint8_t lvl = scale8(br, tri((uint8_t)(phase & 0xFF)));
		for (int i = 0; i < LED_COUNT; i++) {
			scale_px(&out[i], &state.base[i], lvl);
		}
		break;
	}

	case MODE_MARQUEE: {
		/* 一个带拖尾的窗口绕灯带移动，窗口内显示各颗自己的基色 */
		const int trail = 5;
		uint32_t head = (phase / 2U) % LED_COUNT;
		for (int i = 0; i < LED_COUNT; i++) {
			uint32_t d = (head + LED_COUNT - i) % LED_COUNT;
			uint8_t lvl = (d < (uint32_t)trail)
					      ? (uint8_t)(255 - d * (255 / trail))
					      : 0;
			scale_px(&out[i], &state.base[i], scale8(br, lvl));
		}
		break;
	}

	case MODE_FADE: {
		/* 熔灭：一道亮度波沿灯带流动，各颗保持自己的基色 */
		for (int i = 0; i < LED_COUNT; i++) {
			uint8_t t = (uint8_t)((phase + (uint32_t)i * (256U / LED_COUNT)) & 0xFF);
			uint8_t lvl = scale8(br, tri(t));
			scale_px(&out[i], &state.base[i], lvl);
		}
		break;
	}

	default:
		memset(out, 0, sizeof(struct led_rgb) * LED_COUNT);
		break;
	}
}

static inline bool is_animated(enum led_mode m)
{
	return m == MODE_BREATHING || m == MODE_MARQUEE || m == MODE_FADE;
}

static void push_frame(void)
{
	struct led_rgb out[LED_COUNT];

	if (!ready) {
		return;
	}

	k_mutex_lock(&lock, K_FOREVER);
	compute_frame(out);
	k_mutex_unlock(&lock);

	int ret = led_strip_update_rgb(strip, out, LED_COUNT);
	if (ret < 0) {
		LOG_WRN("led_strip_update_rgb failed: %d", ret);
	}
}

static void anim_work_fn(struct k_work *work);
static K_WORK_DELAYABLE_DEFINE(anim_work, anim_work_fn);

static void anim_work_fn(struct k_work *work)
{
	ARG_UNUSED(work);

	enum led_mode m;

	k_mutex_lock(&lock, K_FOREVER);
	m = state.mode;
	phase += (state.speed ? state.speed : 1);
	k_mutex_unlock(&lock);

	push_frame();

	if (is_animated(m)) {
		k_work_schedule(&anim_work, K_MSEC(CONFIG_PLANCKEYS_LED_FRAME_MS));
	}
}

/* 状态变化后调用：立即渲染，并按需启停动画定时器。 */
static void apply_state_change(void)
{
	enum led_mode m;

	push_frame();

	k_mutex_lock(&lock, K_FOREVER);
	m = state.mode;
	k_mutex_unlock(&lock);

	if (is_animated(m)) {
		k_work_schedule(&anim_work, K_MSEC(CONFIG_PLANCKEYS_LED_FRAME_MS));
	} else {
		k_work_cancel_delayable(&anim_work);
	}
}

void planckeys_led_cycle_preset(void)
{
	k_mutex_lock(&lock, K_FOREVER);

	int idx = -1;
	for (int i = 0; i < (int)ARRAY_SIZE(preset_order); i++) {
		if (preset_order[i] == state.mode) {
			idx = i;
			break;
		}
	}
	idx = (idx < 0) ? 0 : (idx + 1) % (int)ARRAY_SIZE(preset_order);
	state.mode = preset_order[idx];

	k_mutex_unlock(&lock);

	LOG_INF("LED preset -> %d", (int)state.mode);
	apply_state_change();
}

static int raw_hid_listener(const zmk_event_t *eh)
{
	const struct raw_hid_received_event *ev = as_raw_hid_received_event(eh);

	if (!ev || ev->data == NULL || ev->length < 1) {
		return ZMK_EV_EVENT_BUBBLE;
	}

	const uint8_t *d = ev->data;
	bool handled = true;

	k_mutex_lock(&lock, K_FOREVER);
	switch (d[0]) {
	case CMD_CONFIG:
		if (ev->length >= 4) {
			uint8_t m = d[1];
			state.mode = (m < MODE_COUNT) ? (enum led_mode)m : MODE_SOLID;
			state.brightness = d[2];
			state.speed = d[3] ? d[3] : 1;
		}
		break;

	case CMD_PIXELS:
		if (ev->length >= 3) {
			uint8_t off = d[1];
			uint8_t cnt = d[2];
			for (uint8_t i = 0; i < cnt; i++) {
				uint8_t idx = off + i;
				uint16_t base = 3 + (uint16_t)i * 3;
				if (idx >= LED_COUNT || (base + 2) >= ev->length) {
					break;
				}
				state.base[idx].r = d[base];
				state.base[idx].g = d[base + 1];
				state.base[idx].b = d[base + 2];
			}
		}
		break;

	case CMD_BRIGHTNESS:
		if (ev->length >= 2) {
			state.brightness = d[1];
		}
		break;

	case CMD_FILL:
		if (ev->length >= 4) {
			for (int i = 0; i < LED_COUNT; i++) {
				state.base[i].r = d[1];
				state.base[i].g = d[2];
				state.base[i].b = d[3];
			}
		}
		break;

	default:
		handled = false;
		break;
	}
	k_mutex_unlock(&lock);

	if (handled) {
		apply_state_change();
	}

	return ZMK_EV_EVENT_BUBBLE;
}

ZMK_LISTENER(planckeys_led_raw_hid, raw_hid_listener);
ZMK_SUBSCRIPTION(planckeys_led_raw_hid, raw_hid_received_event);

#if IS_ENABLED(CONFIG_ZMK_EXT_POWER)
static void enable_ext_power(void)
{
	const struct device *ep = device_get_binding("EXT_POWER");

	if (ep != NULL) {
		int ret = ext_power_enable(ep);
		if (ret < 0) {
			LOG_WRN("ext_power_enable failed: %d", ret);
		}
	} else {
		LOG_WRN("EXT_POWER device not found");
	}
}
#else
static void enable_ext_power(void) {}
#endif

/* 灯带供电需要一点建立时间（EXT_POWER init-delay-ms），首帧延后渲染。 */
static void boot_render_fn(struct k_work *work)
{
	ARG_UNUSED(work);
	ready = true;
	apply_state_change();
}
static K_WORK_DELAYABLE_DEFINE(boot_render, boot_render_fn);

static int planckeys_led_init(void)
{
	if (!device_is_ready(strip)) {
		LOG_ERR("WS2812 strip device not ready");
		return -ENODEV;
	}

	k_mutex_init(&lock);

	state.mode = MODE_SOLID;
	state.brightness = CONFIG_PLANCKEYS_LED_DEFAULT_BRIGHTNESS;
	state.speed = 4;
	/* 默认画布：整块冰蓝，脱离网页也能靠 &led_next 循环出效果 */
	for (int i = 0; i < LED_COUNT; i++) {
		state.base[i].r = 0x00;
		state.base[i].g = 0x40;
		state.base[i].b = 0xFF;
	}

	enable_ext_power();

	k_work_schedule(&boot_render, K_MSEC(200));
	return 0;
}

SYS_INIT(planckeys_led_init, APPLICATION, CONFIG_APPLICATION_INIT_PRIORITY);
