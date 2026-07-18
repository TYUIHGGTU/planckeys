/*
 * SPDX-License-Identifier: MIT
 *
 * planckeys self-developed WS2812 LED controller.
 *
 * 独占 zmk,underglow 指向的 WS2812 灯带（内建 ZMK underglow 必须关闭），
 * 提供：
 *   - 主机(WebHID/Raw HID, usage page 0xFF60) -> 键盘：每颗独立 RGB / 纯色 /
 *     亮度 / 预设模式；
 *   - 内建预设灯效：常亮(solid) / 呼吸(breathing) / 跑马(marquee) / 熔灭(fade) /
 *     关灯(off)；
 *   - keymap 里 &led_next 键循环切换上述预设（见 behavior_led_next.c）。
 *
 * 下行协议（主机 -> 键盘，32 字节 report，无 report id）：
 *   0xA1 CONFIG    : [1]=mode [2]=R [3]=G [4]=B [5]=brightness [6]=speed
 *   0xA2 PIXELS    : [1]=offset [2]=count, 之后每颗 3 字节 RGB；进入逐颗模式
 *   0xA3 BRIGHTNESS: [1]=brightness
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

enum led_mode {
	MODE_OFF = 0,
	MODE_SOLID = 1,
	MODE_BREATHING = 2,
	MODE_MARQUEE = 3,
	MODE_FADE = 4,
	MODE_PIXELS = 5, /* 网页逐颗设定的静态画面 */
	MODE_COUNT
};

/* &led_next 循环顺序：常亮 -> 呼吸 -> 跑马 -> 熔灭 -> 关灯 -> ... */
static const enum led_mode preset_order[] = {
	MODE_SOLID, MODE_BREATHING, MODE_MARQUEE, MODE_FADE, MODE_OFF,
};

static struct {
	enum led_mode mode;
	uint8_t r, g, b;    /* solid / 动画的基色 */
	uint8_t brightness; /* 0-255 全局亮度 */
	uint8_t speed;      /* 1-255 动画速度 */
	struct led_rgb pixels[LED_COUNT]; /* MODE_PIXELS 时的逐颗颜色 */
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

static inline void set_scaled(struct led_rgb *px, uint8_t r, uint8_t g, uint8_t b, uint8_t lvl)
{
	px->r = scale8(r, lvl);
	px->g = scale8(g, lvl);
	px->b = scale8(b, lvl);
}

/* 计算一帧到 out[]（调用方持有 lock）。 */
static void compute_frame(struct led_rgb *out)
{
	const uint8_t br = state.brightness;

	switch (state.mode) {
	case MODE_OFF:
		memset(out, 0, sizeof(struct led_rgb) * LED_COUNT);
		break;

	case MODE_SOLID:
		for (int i = 0; i < LED_COUNT; i++) {
			set_scaled(&out[i], state.r, state.g, state.b, br);
		}
		break;

	case MODE_BREATHING: {
		uint8_t lvl = scale8(br, tri((uint8_t)(phase & 0xFF)));
		for (int i = 0; i < LED_COUNT; i++) {
			set_scaled(&out[i], state.r, state.g, state.b, lvl);
		}
		break;
	}

	case MODE_MARQUEE: {
		/* 一个带拖尾的亮点绕灯带移动 */
		const int trail = 5;
		uint32_t head = (phase / 2U) % LED_COUNT;
		for (int i = 0; i < LED_COUNT; i++) {
			uint32_t d = (head + LED_COUNT - i) % LED_COUNT;
			uint8_t lvl = (d < (uint32_t)trail)
					      ? (uint8_t)(255 - d * (255 / trail))
					      : 0;
			set_scaled(&out[i], state.r, state.g, state.b, scale8(br, lvl));
		}
		break;
	}

	case MODE_FADE: {
		/* 熔灭：一道亮度波沿灯带流动，像逐颗熔化/复燃 */
		for (int i = 0; i < LED_COUNT; i++) {
			uint8_t t = (uint8_t)((phase + (uint32_t)i * (256U / LED_COUNT)) & 0xFF);
			uint8_t lvl = scale8(br, tri(t));
			set_scaled(&out[i], state.r, state.g, state.b, lvl);
		}
		break;
	}

	case MODE_PIXELS:
	default:
		for (int i = 0; i < LED_COUNT; i++) {
			set_scaled(&out[i], state.pixels[i].r, state.pixels[i].g,
				   state.pixels[i].b, br);
		}
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
	/* 当前是逐颗(PIXELS)或未知模式时，从常亮开始 */
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
		if (ev->length >= 7) {
			uint8_t m = d[1];
			state.mode = (m < MODE_COUNT) ? (enum led_mode)m : MODE_SOLID;
			state.r = d[2];
			state.g = d[3];
			state.b = d[4];
			state.brightness = d[5];
			state.speed = d[6] ? d[6] : 1;
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
				state.pixels[idx].r = d[base];
				state.pixels[idx].g = d[base + 1];
				state.pixels[idx].b = d[base + 2];
			}
			state.mode = MODE_PIXELS;
		}
		break;

	case CMD_BRIGHTNESS:
		if (ev->length >= 2) {
			state.brightness = d[1];
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
	state.r = 0x00;
	state.g = 0x40;
	state.b = 0x80;
	state.brightness = CONFIG_PLANCKEYS_LED_DEFAULT_BRIGHTNESS;
	state.speed = 4;

	enable_ext_power();

	k_work_schedule(&boot_render, K_MSEC(200));
	return 0;
}

SYS_INIT(planckeys_led_init, APPLICATION, CONFIG_APPLICATION_INIT_PRIORITY);
