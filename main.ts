import {
	App,
	Plugin,
	MarkdownPostProcessorContext,
	PluginSettingTab,
	Setting,
	Notice,
	MarkdownView,
	WorkspaceLeaf,
} from "obsidian";

// Helper debounce function
function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: number | undefined;
	return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
		const context = this;
		clearTimeout(timeout);
		timeout = window.setTimeout(() => func.apply(context, args), wait);
	};
}

interface ListeningPluginSettings {
	fontFolderPath: string;
	selectedFontFile: string;
	fontSize: number; // New setting for font size in pixels
}

const DEFAULT_SETTINGS: ListeningPluginSettings = {
	fontFolderPath: "",
	selectedFontFile: "DEFAULT",
	fontSize: 16, // Default font size
};

const CUSTOM_FONT_STYLE_ID = "listening-custom-font-style";
const CUSTOM_FONT_FAMILY_PREFIX = "listening-custom-";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function applyCss(css: string, cssId: string): void {
	let styleElement = document.getElementById(
		cssId
	) as HTMLStyleElement | null;
	if (!styleElement) {
		styleElement = document.createElement("style");
		styleElement.id = cssId;
		document.head.appendChild(styleElement);
	}
	styleElement.textContent = css;
}

function removeCss(cssId: string): void {
	const styleElement = document.getElementById(cssId);
	if (styleElement) {
		styleElement.remove();
	}
}

export default class ListeningPlugin extends Plugin {
	settings: ListeningPluginSettings;
	currentFontFamilyName: string | null = null;

	async onload() {
		await this.loadSettings();

		if (!this.settings.fontFolderPath) {
			this.settings.fontFolderPath = this.app.vault.configDir + "/fonts";
			await this.saveSettings();
		}
		await this.loadAndApplyCustomFont();
		// Apply initial font size to existing blocks as well
		await this.updateExistingCodeBlocksStyle();

		this.addSettingTab(new ListeningSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor(
			"listening",
			(source, el, ctx: MarkdownPostProcessorContext) => {
				el.empty();
				el.removeAttribute("style");
				el.addClass("listening-code-block");

				if (
					this.currentFontFamilyName &&
					this.settings.selectedFontFile !== "DEFAULT"
				) {
					el.style.fontFamily = `"${this.currentFontFamilyName}"`;
				}
				el.style.fontSize = `${this.settings.fontSize}px`; // Apply font size

				el.style.border = "1px solid var(--text-accent)";
				el.style.padding = "10px";
				el.style.borderRadius = "5px";

				const lines = source.split("\n");
				for (const line of lines) {
					const p = el.createEl("p");
					this.parseAndRenderLine(p, line);
				}
			}
		);
	}

	async loadAndApplyCustomFont(): Promise<void> {
		if (
			this.settings.selectedFontFile === "DEFAULT" ||
			!this.settings.selectedFontFile
		) {
			removeCss(CUSTOM_FONT_STYLE_ID);
			this.currentFontFamilyName = null;
		} else {
			const fontFilePath = `${this.settings.fontFolderPath}/${this.settings.selectedFontFile}`;

			try {
				if (!(await this.app.vault.adapter.exists(fontFilePath))) {
					new Notice(
						`Listening Plugin: Font file not found at ${fontFilePath}`
					);
					removeCss(CUSTOM_FONT_STYLE_ID);
					this.currentFontFamilyName = null;
				} else {
					const fontArrayBuffer =
						await this.app.vault.adapter.readBinary(fontFilePath);
					const base64Font = arrayBufferToBase64(fontArrayBuffer);
					const fontFileName = this.settings.selectedFontFile;
					const extension = fontFileName
						.split(".")
						.pop()
						?.toLowerCase();
					let mimeType = "";
					switch (extension) {
						case "ttf":
							mimeType = "font/truetype";
							break;
						case "otf":
							mimeType = "font/opentype";
							break;
						case "woff":
							mimeType = "font/woff";
							break;
						case "woff2":
							mimeType = "font/woff2";
							break;
						default:
							new Notice(
								`Listening Plugin: Unsupported font type: ${extension}`
							);
							removeCss(CUSTOM_FONT_STYLE_ID);
							this.currentFontFamilyName = null;
							this.app.workspace.trigger("css-change");
							await this.updateExistingCodeBlocksStyle();
							return;
					}

					const rawFontName = fontFileName.substring(
						0,
						fontFileName.lastIndexOf(".")
					);
					this.currentFontFamilyName =
						CUSTOM_FONT_FAMILY_PREFIX +
						rawFontName.replace(/[^a-zA-Z0-9\-]/g, "_");

					const fontFaceCss = `
						@font-face {
							font-family: "${this.currentFontFamilyName}";
							src: url(data:${mimeType};base64,${base64Font});
						}
					`;
					applyCss(fontFaceCss, CUSTOM_FONT_STYLE_ID);
					new Notice(
						`Listening Plugin: Font "${fontFileName}" loaded as "${this.currentFontFamilyName}".`
					);
				}
			} catch (error) {
				new Notice(
					"Listening Plugin: Error loading custom font: " +
						error.message
				);
				console.error(
					"Listening Plugin: Error loading custom font:",
					error
				);
				removeCss(CUSTOM_FONT_STYLE_ID);
				this.currentFontFamilyName = null;
			}
		}
		this.app.workspace.trigger("css-change");
		await this.updateExistingCodeBlocksStyle(); // Renamed from updateExistingCodeBlocksFont
	}

	async updateExistingCodeBlocksStyle(): Promise<void> {
		// Renamed and updated
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView && leaf.view.previewMode) {
				const previewEl = leaf.view.previewMode.containerEl;
				const listeningBlocks = previewEl.querySelectorAll(
					".listening-code-block"
				);
				listeningBlocks.forEach((block: HTMLElement) => {
					if (
						this.currentFontFamilyName &&
						this.settings.selectedFontFile !== "DEFAULT"
					) {
						block.style.fontFamily = `"${this.currentFontFamilyName}"`;
					} else {
						block.style.fontFamily = "";
					}
					block.style.fontSize = `${this.settings.fontSize}px`; // Apply font size here too
				});
			}
		});
	}

	parseAndRenderLine(parentElement: HTMLElement, line: string) {
		let remainingLine = line;
		let currentElement = parentElement;

		const rules: {
			regex: RegExp;
			style?: string;
			tag?: keyof HTMLElementTagNameMap;
		}[] = [
			{ regex: /~~(.*?)~~/g, tag: "del" }, // Deletion: ~~text~~
			{ regex: /__(.*?)__/g, tag: "u" }, // Underline: __text__
			{ regex: /\*\*(.*?)\*\*/g, tag: "strong" }, // Bold: **text**
			{ regex: /\*(.*?)\*/g, tag: "em" }, // Italic: *text*
			{ regex: /\+\+(.*?)\+\+/g, style: "font-size: 1.5em;" }, // Font size increase: ++text++
			{ regex: /--(.*?)--/g, style: "font-size: 0.5em;" }, // Font size decrease: --text--
		];

		function applyRules(text: string, parentEl: HTMLElement) {
			let lastIndex = 0;
			const parts: (
				| string
				| { text: string; rule: (typeof rules)[0] }
			)[] = [];

			const allMatches: {
				index: number;
				length: number;
				rule: (typeof rules)[0];
				match: RegExpExecArray;
			}[] = [];
			rules.forEach((rule) => {
				let match;
				const regex = new RegExp(rule.regex.source, "g");
				while ((match = regex.exec(text)) !== null) {
					allMatches.push({
						index: match.index,
						length: match[0].length,
						rule,
						match,
					});
				}
			});

			allMatches.sort((a, b) => a.index - b.index || b.length - a.length);

			const processedRanges: { start: number; end: number }[] = [];

			function isOverlapping(start: number, end: number): boolean {
				return processedRanges.some(
					(range) =>
						Math.max(start, range.start) < Math.min(end, range.end)
				);
			}

			for (const { index, length, rule, match } of allMatches) {
				const matchStart = index;
				const matchEnd = index + length;

				if (isOverlapping(matchStart, matchEnd)) continue;

				if (matchStart > lastIndex) {
					parts.push(text.substring(lastIndex, matchStart));
				}
				parts.push({ text: match[1], rule });
				lastIndex = matchEnd;
				processedRanges.push({ start: matchStart, end: matchEnd });
			}

			if (lastIndex < text.length) {
				parts.push(text.substring(lastIndex));
			}

			parts.forEach((part) => {
				if (typeof part === "string") {
					parentEl.appendText(part);
				} else {
					const { text: content, rule } = part;
					const span = parentEl.createEl(rule.tag || "span");
					if (rule.style) {
						span.style.cssText += rule.style;
					}
					applyRules(content, span);
				}
			});
		}

		applyRules(remainingLine, currentElement);
	}

	onunload() {
		// Clean up the dynamically added style tag
		removeCss(CUSTOM_FONT_STYLE_ID);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// After saving, reload and apply the font to reflect changes immediately.
		await this.loadAndApplyCustomFont();
	}
}

class ListeningSettingTab extends PluginSettingTab {
	plugin: ListeningPlugin;
	availableFonts: { [key: string]: string } = {}; // To store display name (file name) and file name
	private debouncedUpdateFontSize: (value: string) => void;

	constructor(app: App, plugin: ListeningPlugin) {
		super(app, plugin);
		this.plugin = plugin;

		// Initialize the debounced function
		this.debouncedUpdateFontSize = debounce(async (value: string) => {
			const newSize = parseInt(value);
			if (!isNaN(newSize) && newSize > 0) {
				this.plugin.settings.fontSize = newSize;
				await this.plugin.saveSettings();
				await this.plugin.updateExistingCodeBlocksStyle();
			} else {
				new Notice(
					"Please enter a valid positive number for font size."
				);
				// Revert to the current setting value if input is invalid
				// This requires the text component to be passed or accessed,
				// for simplicity, we'll just show a notice.
				// A more robust solution might involve re-rendering the setting or passing the text component.
			}
		}, 500); // 500ms delay
	}

	async scanFontFiles(): Promise<void> {
		this.availableFonts = { DEFAULT: "Obsidian Default" };
		try {
			const fontFolderPath = this.plugin.settings.fontFolderPath;
			if (
				!fontFolderPath ||
				!(await this.app.vault.adapter.exists(fontFolderPath))
			) {
				console.log(
					"Listening Plugin: Font folder path does not exist or is not set for scanning."
				);
				return;
			}

			const listResult = await this.app.vault.adapter.list(
				fontFolderPath
			);
			const fontExtensions = [".ttf", ".otf", ".woff", ".woff2"];

			for (const filePath of listResult.files) {
				// filePath here is absolute, or relative to vault root depending on adapter.list behavior
				// We need just the file name for the dropdown and settings
				const fileName = filePath.substring(
					filePath.lastIndexOf("/") + 1
				);
				if (
					fileName &&
					fontExtensions.some((ext) =>
						fileName.toLowerCase().endsWith(ext)
					)
				) {
					this.availableFonts[fileName] = fileName;
				}
			}
		} catch (e) {
			console.error("Listening Plugin: Error scanning font files:", e);
			new Notice(
				"Listening Plugin: Error scanning font folder. Check console for details."
			);
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Listening Plugin Settings" });

		new Setting(containerEl)
			.setName("Font Folder Path")
			.setDesc(
				"Absolute path to the folder containing your .ttf, .otf, .woff, or .woff2 font files."
			)
			.addText((text) =>
				text
					.setPlaceholder(this.plugin.app.vault.configDir + "/fonts")
					.setValue(this.plugin.settings.fontFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.fontFolderPath =
							value || this.plugin.app.vault.configDir + "/fonts";
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// Font File Selection Setting
		const fontFileSetting = new Setting(containerEl)
			.setName("Select Font File")
			.setDesc(
				'Select the font file to use. Select "DEFAULT" to use Obsidian\'s default font.'
			);

		// Scan fonts and then build the rest of the UI
		this.scanFontFiles().then(() => {
			fontFileSetting.addDropdown((dropdown) => {
				for (const fontFileKey in this.availableFonts) {
					dropdown.addOption(
						fontFileKey,
						this.availableFonts[fontFileKey]
					);
				}
				dropdown
					.setValue(this.plugin.settings.selectedFontFile)
					.onChange(async (value) => {
						this.plugin.settings.selectedFontFile = value;
						await this.plugin.saveSettings();
						await this.plugin.loadAndApplyCustomFont(); // This will now also update existing blocks
						// No need to call updateExistingCodeBlocksFont here as loadAndApplyCustomFont does it.
					});
			});
		});

		// Font Size Setting with Debounce
		new Setting(containerEl)
			.setName("Font Size (px)")
			.setDesc(
				"Set the font size for the listening code blocks in pixels."
			)
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.fontSize))
					.setValue(String(this.plugin.settings.fontSize))
					.onChange(this.debouncedUpdateFontSize)
			); // Use the debounced function

		// Rescan Fonts Button
		new Setting(containerEl)
			.setName("Rescan Fonts")
			.setDesc("Click to rescan the font folder for new font files.")
			.addButton((button) =>
				button.setButtonText("Rescan").onClick(() => {
					this.display();
				})
			);
	}

	getFontFiles(folderPath: string): string[] {
		if (!folderPath) return [];
		try {
			const fs = require("fs");
			const path = require("path");
			const files = fs.readdirSync(folderPath);
			return files.filter((file: string) =>
				/\.(ttf|otf|woff|woff2)$/i.test(file)
			);
		} catch (error) {
			console.error(
				"Listening Plugin: Error reading font folder:",
				error
			);
			new Notice(
				`Listening Plugin: Error reading font folder: ${folderPath}. Please ensure the path is correct and accessible.`
			);
			return [];
		}
	}
}
