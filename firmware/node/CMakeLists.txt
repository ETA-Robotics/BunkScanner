# BunkScanner Node Firmware — CMake Build
# Target: STM32G071RBT6
# Toolchain: arm-none-eabi-gcc

cmake_minimum_required(VERSION 3.20)

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR arm)

# Toolchain
set(CMAKE_C_COMPILER arm-none-eabi-gcc)
set(CMAKE_ASM_COMPILER arm-none-eabi-gcc)
set(CMAKE_OBJCOPY arm-none-eabi-objcopy)
set(CMAKE_SIZE arm-none-eabi-size)

project(bunkscanner_node C ASM)

# MCU flags
set(MCU_FLAGS "-mcpu=cortex-m0plus -mthumb")
set(CMAKE_C_FLAGS "${MCU_FLAGS} -Wall -Wextra -fdata-sections -ffunction-sections")
set(CMAKE_C_FLAGS_DEBUG "-Og -g3 -DDEBUG")
set(CMAKE_C_FLAGS_RELEASE "-Os -DNDEBUG")
set(CMAKE_EXE_LINKER_FLAGS "${MCU_FLAGS} -T${CMAKE_SOURCE_DIR}/STM32G071RBTx_FLASH.ld -Wl,--gc-sections -specs=nano.specs -specs=nosys.specs")

# Definitions
add_definitions(
    -DSTM32G071xx
    -DUSE_HAL_DRIVER
)

# Include paths
include_directories(
    Inc
    Drivers/CMSIS/Device/ST/STM32G0xx/Include
    Drivers/CMSIS/Include
    Drivers/STM32G0xx_HAL_Driver/Inc
)

# Source files
file(GLOB_RECURSE SOURCES
    "Src/*.c"
    "Drivers/STM32G0xx_HAL_Driver/Src/*.c"
    "Drivers/CMSIS/Device/ST/STM32G0xx/Source/Templates/system_stm32g0xx.c"
    "startup_stm32g071xx.s"
)

# Executable
add_executable(${PROJECT_NAME}.elf ${SOURCES})

# Post-build: generate .hex and .bin
add_custom_command(TARGET ${PROJECT_NAME}.elf POST_BUILD
    COMMAND ${CMAKE_OBJCOPY} -O ihex $<TARGET_FILE:${PROJECT_NAME}.elf> ${PROJECT_NAME}.hex
    COMMAND ${CMAKE_OBJCOPY} -O binary $<TARGET_FILE:${PROJECT_NAME}.elf> ${PROJECT_NAME}.bin
    COMMAND ${CMAKE_SIZE} $<TARGET_FILE:${PROJECT_NAME}.elf>
    COMMENT "Generating .hex and .bin"
)
