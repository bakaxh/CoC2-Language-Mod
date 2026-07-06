# CoC2 Embedded Translation Patch

This directory is for the embedded translation for CoC2. It injects a general DOM text hook script into the Electron page of the local game.

## Development Notes

Replace the files in the directory with the corresponding files in the game installation directory's resources/app directory.

## Debugging Notes

Press Ctrl+Shift+I to open the developer tools, then switch to the Console tab.

Select Verbose in Console Level to view the translated text.

## Working Method

1. Load main.json and enums.json through fetch to build a dictionary.
2. Tokenize the text into ordinary text, HTML tags, and custom tags.
3. Use precise matching from main.json to replace the text.
4. Parse and translate HTML tags and custom tags.
5. Hook document.createTextNode, Node.textContent, Element.innerHTML, Node.nodeValue, and CharacterData.data.
6. Hook window.textify and Parser.parse to implement template strings and custom parsers.

## Disclaimer

This translation patch is for personal use only and does not guarantee the accuracy of the translation. By using this patch, you agree to assume any risks that may arise from its use. The copyright of the original author is hereby acknowledged, and the translation patch is for personal learning and use purposes only and may not be used for commercial purposes.