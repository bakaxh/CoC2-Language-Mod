# CoC2 内嵌中文翻译补丁

基于CoC2LunaAdapter原仓库 https://github.com/Twispra/CoC2LunaAdapter/

这个目录是给 CoC2 使用的本地内嵌翻译。在本机游戏的 Electron 页面里注入一个通用 DOM 文本适配脚本。

## 开发说明

将patch目录下的文件替换到游戏安装目录的resources/app目录下。

enums.json: 包含游戏中的枚举值(%s、%d、%f)对应的中文翻译。
templates.json: 包含游戏中所有的文本模板，使用 enums.json 中的枚举值进行替换。
ui.json: 包含游戏中所有的 UI 文本。
attrs.json: 包含游戏中所有的数据文本。
story.json: 包含游戏中所有的剧情文本。

## 调试说明

Ctrl+Shift+I 打开开发者工具，切换到 Console 标签页。
