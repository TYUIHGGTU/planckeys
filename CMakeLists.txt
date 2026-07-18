# SPDX-License-Identifier: MIT
# 仓库根即一个 ZMK/Zephyr 模块：自研 WS2812 灯带控制 + 网页(WebHID)控制。
# ZMK 的 build-user-config 工作流检测到仓库根有 zephyr/module.yml 时，会自动
# 以 -DZMK_EXTRA_MODULES=<repo root> 把本模块编入构建。

if(CONFIG_PLANCKEYS_LED_CONTROL)
  target_sources(app PRIVATE src/led_control.c)
  target_sources(app PRIVATE src/behavior_led_next.c)
  zephyr_include_directories(include)
endif()
