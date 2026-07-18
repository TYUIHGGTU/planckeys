/*
 * SPDX-License-Identifier: MIT
 *
 * planckeys self-developed WS2812 LED controller — public API used by the
 * &led_next behavior driver.
 */

#pragma once

/* 循环切换灯效预设：常亮 -> 呼吸 -> 跑马 -> 熔灭 -> 关灯 -> 常亮 ... */
void planckeys_led_cycle_preset(void);
