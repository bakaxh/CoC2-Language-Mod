# CoC2 / TiTS LunaTranslator 内嵌适配器

这个目录是给 CoC2 和 TiTS 使用的 LunaTranslator 内嵌翻译安装器。它不分发改版游戏本体，只在本机游戏的 Electron 页面里注入一个通用 DOM 文本适配脚本。

## 适合怎么用

把整个 `CoC2LunaAdapter` 文件夹放到 LunaTranslator 目录旁边，或者放到 CoC2 / TiTS 目录旁边，然后双击：

```bat
install.bat
```

双击后会打开图形界面：

- 点 `Auto Detect` 自动查找 CoC2 / TiTS 和 LunaTranslator
- 自动查找失败时，点游戏路径旁边的 `Browse...`，选择 `CoC II.exe` 或 `TiTS.exe`
- 点 LunaTranslator 旁边的 `Browse...`，选择 LunaTranslator 根目录
- 点 `Install / Update` 安装或更新适配器

路径会保存到 `adapter-config.json`，下一次打开会自动带出。

如果你更喜欢命令行，也可以手动指定路径：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -GamePath "D:\Games\CoC_II-0.8.35-win\CoC II.exe" -LunaRoot "D:\LunaTranslator_x64_win10"
```

TiTS 示例：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -GamePath "D:\Games\TiTS-public-0.9.158-win\TiTS.exe" -LunaRoot "D:\LunaTranslator_x64_win10"
```

游戏更新后，重新运行一次安装器即可。

## 它会改什么

- 复制 `adapter\coc2-luna-adapter.js` 到游戏的 `resources\app\`
- 给游戏的 `resources\app\index.html` 加一行脚本入口
- 开启 LunaTranslator 的本地 API：`networktcpenable=true`，默认端口 `2333`
- 保存路径配置到 `adapter-config.json`
- 修改前会在目标目录创建 `.luna-fenoxo-backups` 备份

它不会改 CoC2 / TiTS 的剧情内容 JS，也不会依赖某个固定版本的按钮、正文、Journal 类名。

## 工作原理

适配脚本运行在游戏页面里，程序化扫描真实 DOM 文本节点和常见文本属性：

- 正文、Journal、Powers/能力卡牌、侧边栏、筛选器、按钮、标题
- tooltip 中隐藏但已经存在于 DOM 的文本
- `placeholder`、`title`、`aria-label`、`alt`、按钮型 `input[value]`

扫描到英文文本后，它会调用 LunaTranslator 本地接口：

```text
http://127.0.0.1:2333/api/translate
```

然后把译文写回原来的 DOM 文本位置，实现内嵌显示。

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -GamePath "D:\Games\CoC_II-0.8.35-win" -Uninstall
```

也可以双击 `install.bat`，在图形界面里点 `Uninstall`。

卸载只移除游戏里的适配器入口和适配 JS，不会关闭 LunaTranslator 的本地 API。

## 注意事项

- 运行游戏前先启动 LunaTranslator，并确保至少有一个翻译器启用。
- 如果 LunaTranslator 正在运行，安装器会尝试写配置；若 Luna 退出时覆盖配置，请关闭 Luna 后重新运行安装器。
- 图片、canvas、CSS 伪元素里画出来的文字不是 DOM 文本，无法通过这个适配器直接翻译。
- 如果未来 CoC2 / TiTS 改成只提供 `app.asar` 而没有 `resources\app\index.html`，需要先解包或另做 asar 支持。
