import { App, setIcon } from "obsidian";
import type { ResolvedEmbed } from "../core/embeds";

export interface EmbedHoverDeps {
	/** Включено ли подсказывание (настройка `suggestWrapImages`). */
	enabled: () => boolean;
	resolve: (src: string) => ResolvedEmbed | null;
	onOpenWrapper: (wrapperId: string) => void;
	onCreateWrapper: (attachment: string) => void;
	/** Журнал плагина: ошибки разбора embed не должны ломать наведение. */
	log: (message: string, details?: unknown) => void;
}

/** Задержка скрытия: успевает дойти курсор от картинки до значка. */
const HIDE_DELAY_MS = 160;

/** Значок чуть меньше картинки по правому верхнему углу. */
const BUTTON_SIZE = 26;
const BUTTON_OFFSET = 6;

/**
 * Значок над изображением в теле заметки (C-IMG-03).
 *
 * Реализовано делегированием событий на `document`, без CodeMirror: так одно и
 * то же поведение работает и в Reading view, и в Live Preview. Постпроцессоры
 * (ими сделан показ `![[image_{id}]]`) в Live Preview не вызываются вовсе,
 * поэтому расширение редактора не используется — и конфликт с собственным
 * виджетом embed Obsidian исключён.
 */
export class EmbedHoverActions {
	private readonly app: App;
	private readonly deps: EmbedHoverDeps;
	private layer: HTMLElement | null = null;
	private button: HTMLButtonElement | null = null;
	private current: ResolvedEmbed | null = null;
	private hideTimer: number | null = null;
	private attached = false;

	private readonly onPointerOver = (event: Event): void => {
		this.handleOver(event as PointerEvent);
	};
	private readonly onScroll = (): void => {
		this.hide();
	};
	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			this.hide();
		}
	};

	constructor(app: App, deps: EmbedHoverDeps) {
		this.app = app;
		this.deps = deps;
	}

	attach(): void {
		if (this.attached) {
			return;
		}
		this.attached = true;
		document.addEventListener("pointerover", this.onPointerOver, true);
		document.addEventListener("scroll", this.onScroll, true);
		document.addEventListener("keydown", this.onKeyDown);
	}

	detach(): void {
		if (!this.attached) {
			return;
		}
		this.attached = false;
		document.removeEventListener("pointerover", this.onPointerOver, true);
		document.removeEventListener("scroll", this.onScroll, true);
		document.removeEventListener("keydown", this.onKeyDown);
		this.destroy();
	}

	private handleOver(event: PointerEvent): void {
		if (!this.deps.enabled()) {
			this.hide();
			return;
		}
		const node = event.target;
		if (!(node instanceof HTMLElement)) {
			return;
		}
		// Курсор на самом значке — не прячем.
		if (node.closest(".meta-kb-hover-layer")) {
			this.cancelHide();
			return;
		}

		const embed = node.closest(".internal-embed");
		if (!(embed instanceof HTMLElement)) {
			this.scheduleHide();
			return;
		}

		const src = embed.getAttribute("src") ?? "";
		let resolved: ResolvedEmbed | null = null;
		try {
			resolved = this.deps.resolve(src);
		} catch (err) {
			this.deps.log("hover: не удалось разобрать embed", err);
			resolved = null;
		}
		if (!resolved) {
			this.scheduleHide();
			return;
		}
		this.show(embed, resolved);
	}

	private ensureLayer(): void {
		if (this.layer && this.button) {
			return;
		}
		const layer = document.createElement("div");
		layer.addClass("meta-kb-hover-layer");
		layer.style.display = "none";

		const button = document.createElement("button");
		button.type = "button";
		button.addClass("meta-kb-hover-action");
		layer.appendChild(button);

		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.activate();
		});
		layer.addEventListener("pointerover", () => this.cancelHide());
		layer.addEventListener("pointerleave", () => this.scheduleHide());

		document.body.appendChild(layer);
		this.layer = layer;
		this.button = button;
	}

	private show(embed: HTMLElement, resolved: ResolvedEmbed): void {
		this.cancelHide();
		this.ensureLayer();
		if (!this.layer || !this.button) {
			return;
		}
		this.current = resolved;

		const isOpen = resolved.action === "open-wrapper";
		this.button.empty();
		setIcon(this.button, isOpen ? "image" : "image-plus");
		const title = isOpen
			? `Открыть обёртку: ${resolved.label}`
			: `Создать обёртку: ${resolved.label}`;
		this.button.setAttribute("title", title);
		this.button.setAttribute("aria-label", title);

		const rect = embed.getBoundingClientRect();
		const left = Math.min(
			Math.max(4, rect.right - BUTTON_SIZE - BUTTON_OFFSET),
			window.innerWidth - BUTTON_SIZE - 4,
		);
		const top = Math.min(
			Math.max(4, rect.top + BUTTON_OFFSET),
			window.innerHeight - BUTTON_SIZE - 4,
		);
		this.layer.style.left = `${left}px`;
		this.layer.style.top = `${top}px`;
		this.layer.style.display = "block";
	}

	private activate(): void {
		const target = this.current;
		this.hide();
		if (!target) {
			return;
		}
		if (target.action === "open-wrapper" && target.wrapperId) {
			this.deps.onOpenWrapper(target.wrapperId);
			return;
		}
		if (target.action === "create-wrapper" && target.attachment !== "") {
			this.deps.onCreateWrapper(target.attachment);
		}
	}

	private cancelHide(): void {
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private scheduleHide(): void {
		this.cancelHide();
		this.hideTimer = window.setTimeout(() => {
			this.hideTimer = null;
			this.hide();
		}, HIDE_DELAY_MS);
	}

	private hide(): void {
		this.cancelHide();
		this.current = null;
		if (this.layer) {
			this.layer.style.display = "none";
		}
	}

	private destroy(): void {
		this.cancelHide();
		this.layer?.remove();
		this.layer = null;
		this.button = null;
		this.current = null;
	}
}