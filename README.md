# Listening Annotations 英语听力标注插件

一个用于在 Obsidian 中展示英语听力标注的插件，支持自定义字体和丰富的文本样式。

## 功能特性

- 📝 支持在代码块(` ```listening `)中展示听力文本
- ✏️ 丰富的文本标注格式：
  - **粗体**：`**text**`
  - _斜体_：`*text*`
  - ~~删除线~~：`~~text~~`
  - 下划线：`__text__`
  - 字体放大：`++text++`
  - 字体缩小：`--text--`
- 🅰️ 支持自定义字体（TTF/OTF/WOFF/WOFF2 格式）
- 🎨 美观的代码块样式
- 支持插入听力音频（mp3/wav/ogg 格式）

## 安装方法

1. 在 Obsidian 中打开插件市场
2. 搜索"Listening Annotations"
3. 点击安装
4. 启用插件

## 使用方法

创建一个代码块，语言设置为 `listening`：

````markdown
```listening
**Important words** should be bold.

*Italic text* for emphasis.

~~Strikethrough~~ for corrections.

__Underline__ for key points.

++Large++ and --small-- text sizes.
```
````

