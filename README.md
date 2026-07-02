# CoC2 内嵌中文翻译补丁

基于CoC2LunaAdapter原仓库 https://github.com/Twispra/CoC2LunaAdapter/

这个目录是给 CoC2 使用的本地内嵌翻译。在本机游戏的 Electron 页面里注入一个通用 DOM 文本hook脚本。

## 开发说明

将patch目录下的文件替换到游戏安装目录的resources/app目录下。

enums.json: 包含游戏中的枚举值(%s、%d、%f)对应的中文翻译。

main.json: 包含游戏中所有的 UI 文本。

## 调试说明

Ctrl+Shift+I 打开开发者工具，切换到 Console 标签页。

打开Console Level选择Verbose 查看已翻译的文本。

## 工作方式

1. 通过 fetch 加载 main.json 和 enums.json，构建字典。
2. 通过 tokenize 将文本分解为普通文本、HTML 标签和自定义标签。
3. 使用 main.json 的精确匹配替换文本。
4. 对 HTML 标签和自定义标签进行解析和翻译。
5. hook document.createTextNode、Node.textContent、Element.innerHTML、Node.nodeValue 和 CharacterData.data。
6. hook window.textify 和 Parser.parse，实现模板字符串和自定义解析器的翻译。

## 免责声明

本翻译补丁仅供个人使用，不保证翻译的准确性。使用本补丁即表示您同意承担由此产生的任何风险。
版权归原作者所有，翻译补丁仅为个人学习和使用目的，不得用于商业用途。
