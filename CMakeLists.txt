cmake_minimum_required(VERSION 3.16)
project(CB8 VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets)
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBZIP REQUIRED libzip)

add_executable(CB8
    src/main.cpp
    src/MainWindow.cpp
    src/ImageView.cpp
    src/CbzLoader.cpp
)

target_include_directories(CB8 PRIVATE src ${LIBZIP_INCLUDE_DIRS})
target_link_libraries(CB8 PRIVATE Qt6::Core Qt6::Gui Qt6::Widgets ${LIBZIP_LIBRARIES})
target_compile_options(CB8 PRIVATE ${LIBZIP_CFLAGS_OTHER})
