/*
 * SPDX-License-Identifier: MIT
 *
 * &led_next behavior：按一下循环切换自研 LED 预设（常亮/呼吸/跑马/熔灭/关灯）。
 * 实际灯带由 src/led_control.c 驱动。
 */

#define DT_DRV_COMPAT planckeys_behavior_led_next

#include <zephyr/device.h>
#include <drivers/behavior.h>
#include <zephyr/logging/log.h>

#include <zmk/behavior.h>

#include "planckeys_led.h"

LOG_MODULE_DECLARE(planckeys_led, CONFIG_ZMK_LOG_LEVEL);

#if DT_HAS_COMPAT_STATUS_OKAY(DT_DRV_COMPAT)

static int on_keymap_binding_pressed(struct zmk_behavior_binding *binding,
				     struct zmk_behavior_binding_event event)
{
	ARG_UNUSED(binding);
	ARG_UNUSED(event);

	planckeys_led_cycle_preset();
	return ZMK_BEHAVIOR_OPAQUE;
}

static int on_keymap_binding_released(struct zmk_behavior_binding *binding,
				      struct zmk_behavior_binding_event event)
{
	ARG_UNUSED(binding);
	ARG_UNUSED(event);
	return ZMK_BEHAVIOR_OPAQUE;
}

static const struct behavior_driver_api behavior_led_next_driver_api = {
	.binding_pressed = on_keymap_binding_pressed,
	.binding_released = on_keymap_binding_released,
};

static int behavior_led_next_init(const struct device *dev)
{
	ARG_UNUSED(dev);
	return 0;
}

BEHAVIOR_DT_INST_DEFINE(0, behavior_led_next_init, NULL, NULL, NULL, POST_KERNEL,
			CONFIG_KERNEL_INIT_PRIORITY_DEFAULT, &behavior_led_next_driver_api);

#endif /* DT_HAS_COMPAT_STATUS_OKAY */
