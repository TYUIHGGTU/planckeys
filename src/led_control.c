/*
 * SPDX-License-Identifier: MIT
 *
 * planckeys self-developed WS2812 LED controller.
 *
 * 独占 zmk,underglow 指向的 WS2812 灯带（内建 ZMK underglow 必须关闭），
 * 提供：
 *   - 主机(WebHID/Raw HID, usage page 0xFF60) -> 键盘：**每颗独立基色画布**
 *     + 轴灯/底灯独立模式、亮度、速度；
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
 *   0xA5 ZONE_CONFIG: [1]=zone [2]=mode [3]=brightness [4]=speed
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
BUILD_ASSERT(CONFIG_PLANCKEYS_LED_AXIS_START > 0,
	     "PLANCKEYS_LED_AXIS_START must leave at least one underglow LED");
BUILD_ASSERT(CONFIG_PLANCKEYS_LED_AXIS_START < LED_COUNT,
	     "PLANCKEYS_LED_AXIS_START must leave at least one axis LED");

static const struct device *const strip = DEVICE_DT_GET(STRIP_NODE);

/* Raw HID opcodes (须与 tools/led-web 网页保持一致) */
#define CMD_CONFIG     0xA1
#define CMD_PIXELS     0xA2
#define CMD_BRIGHTNESS 0xA3
#define CMD_FILL       0xA4
#define CMD_ZONE_CONFIG 0xA5

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

enum led_zone {
	ZONE_AXIS = 0,
	ZONE_UNDERGLOW = 1,
	ZONE_COUNT,
};

struct zone_state {
	enum led_mode mode;
	uint8_t brightness;
	uint8_t speed;
};

static struct {
	struct zone_state zones[ZONE_COUNT];
	struct led_rgb base[LED_COUNT]; /* 每颗基色画布：颜色的唯一来源 */
} state;

static struct k_mutex lock;
static uint32_t phase[ZONE_COUNT];
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

static inline enum led_zone zone_for_index(int index)
{
	return index < CONFIG_PLANCKEYS_LED_AXIS_START ? ZONE_UNDERGLOW : ZONE_AXIS;
}

/* 计算一个分区内一颗灯的帧颜色（调用方持有 lock）。 */
static void compute_zone_pixel(enum led_zone zone, int index, struct led_rgb *out)
{
	const struct zone_state *cfg = &state.zones[zone];
	const int start = zone == ZONE_UNDERGLOW ? 0 : CONFIG_PLANCKEYS_LED_AXIS_START;
	const int count = zone == ZONE_UNDERGLOW ? CONFIG_PLANCKEYS_LED_AXIS_START
						 : LED_COUNT - CONFIG_PLANCKEYS_LED_AXIS_START;
	const int local_index = index - start;

	switch (cfg->mode) {
	case MODE_OFF:
		memset(out, 0, sizeof(*out));
		break;

	case MODE_SOLID:
		scale_px(out, &state.base[index], cfg->brightness);
		break;

	case MODE_BREATHING: {
		uint8_t lvl = scale8(cfg->brightness, tri((uint8_t)(phase[zone] & 0xFF)));
		scale_px(out, &state.base[index], lvl);
		break;
	}

	case MODE_MARQUEE: {
		const int trail = MIN(5, count);
		uint32_t head = (phase[zone] / 2U) % count;
		uint32_t distance = (head + count - local_index) % count;
		uint8_t lvl = (distance < (uint32_t)trail)
				      ? (uint8_t)(255 - distance * (255 / trail))
				      : 0;
		scale_px(out, &state.base[index], scale8(cfg->brightness, lvl));
		break;
	}

	case MODE_FADE: {
		uint8_t t = (uint8_t)((phase[zone] +
				      (uint32_t)local_index * (256U / count)) & 0xFF);
		uint8_t lvl = scale8(cfg->brightness, tri(t));
		scale_px(out, &state.base[index], lvl);
		break;
	}

	default:
		memset(out, 0, sizeof(*out));
		break;
	}
}

/* 计算一帧到 out[]（调用方持有 lock）。 */
static void compute_frame(struct led_rgb *out)
{
	for (int i = 0; i < LED_COUNT; i++) {
		compute_zone_pixel(zone_for_index(i), i, &out[i]);
	}
}

static inline bool is_animated(enum led_mode m)
{
	return m == MODE_BREATHING || m == MODE_MARQUEE || m == MODE_FADE;
}

static inline bool any_zone_animated(void)
{
	return is_animated(state.zones[ZONE_AXIS].mode) ||
	       is_animated(state.zones[ZONE_UNDERGLOW].mode);
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

	bool animated;

	k_mutex_lock(&lock, K_FOREVER);
	for (int zone = 0; zone < ZONE_COUNT; zone++) {
		if (is_animated(state.zones[zone].mode)) {
			phase[zone] += state.zones[zone].speed ? state.zones[zone].speed : 1;
		}
	}
	animated = any_zone_animated();
	k_mutex_unlock(&lock);

	push_frame();

	if (animated) {
		k_work_schedule(&anim_work, K_MSEC(CONFIG_PLANCKEYS_LED_FRAME_MS));
	}
}

/* 状态变化后调用：立即渲染，并按需启停动画定时器。 */
static void apply_state_change(void)
{
	bool animated;

	push_frame();

	k_mutex_lock(&lock, K_FOREVER);
	animated = any_zone_animated();
	k_mutex_unlock(&lock);

	if (animated) {
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
		if (preset_order[i] == state.zones[ZONE_AXIS].mode) {
			idx = i;
			break;
		}
	}
	idx = (idx < 0) ? 0 : (idx + 1) % (int)ARRAY_SIZE(preset_order);
	state.zones[ZONE_AXIS].mode = preset_order[idx];
	state.zones[ZONE_UNDERGLOW].mode = preset_order[idx];

	k_mutex_unlock(&lock);

	LOG_INF("LED preset -> %d", (int)state.zones[ZONE_AXIS].mode);
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
			for (int zone = 0; zone < ZONE_COUNT; zone++) {
				state.zones[zone].mode =
					(m < MODE_COUNT) ? (enum led_mode)m : MODE_SOLID;
				state.zones[zone].brightness = d[2];
				state.zones[zone].speed = d[3] ? d[3] : 1;
			}
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
			state.zones[ZONE_AXIS].brightness = d[1];
			state.zones[ZONE_UNDERGLOW].brightness = d[1];
		}
		break;

	case CMD_ZONE_CONFIG:
		if (ev->length >= 5 && d[1] < ZONE_COUNT) {
			uint8_t zone = d[1];
			uint8_t mode = d[2];
			state.zones[zone].mode =
				(mode < MODE_COUNT) ? (enum led_mode)mode : MODE_SOLID;
			state.zones[zone].brightness = d[3];
			state.zones[zone].speed = d[4] ? d[4] : 1;
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

	for (int zone = 0; zone < ZONE_COUNT; zone++) {
		state.zones[zone].mode = MODE_SOLID;
		state.zones[zone].brightness = CONFIG_PLANCKEYS_LED_DEFAULT_BRIGHTNESS;
		state.zones[zone].speed = 4;
		phase[zone] = 0;
	}
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
