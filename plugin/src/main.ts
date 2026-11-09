import { Plugin, WorkspaceLeaf } from "obsidian";
import {
        DEFAULT_SETTINGS,
        MetaKBSettings,
        MetaKBSettingTab,
} from "./settings";
import {
        MetaKBPropertiesView,
        VIEW_TYPE_META_KB_PROPERTIES,
} from "./ui/PropertiesView";

/** Класс на <body>: включает CSS-скрытие core Properties (styles.css). */
const HIDE_CORE_PROPERTIES_CSS_CLASS = "meta-kb-hide-core-properties";

/**
 * Meta KB — плагин поддержки метамодели Second Brain PKB.
 *
 * Срез ITER-2026-11-06-0 (AGENT-TASK.md):
 * каркас Properties Widget + скрытие core Properties.
 * Полный Registry/Schema — в следующих срезах (plugin/DESIGN.md §7.8).
 */
export default class MetaKBPlugin extends Plugin {
        /** Настройки плагина (загружаются в onload). */
        public override settings!: MetaKBSettings;

        override async onload(): Promise<void> {
                await this.loadSettings();

                // 1. View «Meta KB Properties» (правая боковая панель).
                this.registerView(
                        VIEW_TYPE_META_KB_PROPERTIES,
                        (leaf: WorkspaceLeaf) => new MetaKBPropertiesView(leaf, this),
                );

                // 2. Команда открытия виджета.
                this.addCommand({
                        id: "open-properties-widget",
                        name: "Open properties widget",
                        callback: () => {
                                void this.activatePropertiesView();
                        },
                });

                // 3. Настройки.
                this.addSettingTab(new MetaKBSettingTab(this.app, this));

                // 4. CSS-скрытие core Properties (ADR-006).
                this.applyHideCoreProperties();

                console.log("Meta KB plugin loaded");
        }

        override onunload(): void {
                // Снимаем служебный класс с <body>; листья не детачим —
                // Obsidian сам восстановит view при повторном включении плагина.
                document.body.classList.remove(HIDE_CORE_PROPERTIES_CSS_CLASS);
                console.log("Meta KB plugin unloaded");
        }

        /** Включает/выключает CSS-скрытие core Properties по настройке. */
        public applyHideCoreProperties(): void {
                document.body.classList.toggle(
                        HIDE_CORE_PROPERTIES_CSS_CLASS,
                        this.settings.hideCoreProperties,
                );
        }

        /** Открывает (или активирует существующий) leaf виджета в правой панели. */
        private async activatePropertiesView(): Promise<void> {
                const { workspace } = this.app;

                let leaf: WorkspaceLeaf | null = null;
                const existing = workspace.getLeavesOfType(VIEW_TYPE_META_KB_PROPERTIES);
                if (existing.length > 0) {
                        leaf = existing[0];
                } else {
                        // getRightLeaf существует с 0.9.7 — совместимо с minAppVersion 1.5.0.
                        leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
                        await leaf.setViewState({
                                type: VIEW_TYPE_META_KB_PROPERTIES,
                                active: true,
                        });
                }
                if (leaf) {
                        await workspace.revealLeaf(leaf);
                }
        }

        async loadSettings(): Promise<void> {
                const stored = (await this.loadData()) as Partial<MetaKBSettings> | null;
                this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
        }

        async saveSettings(): Promise<void> {
                await this.saveData(this.settings);
        }
}
