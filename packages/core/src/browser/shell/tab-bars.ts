/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TabBar, Title, Widget, DockPanel } from '@phosphor/widgets';
import { VirtualElement, h, VirtualDOM, ElementInlineStyle } from '@phosphor/virtualdom';
import { MenuPath } from '../../common';
import { ContextMenuRenderer } from '../context-menu-renderer';
import { Signal } from '@phosphor/signaling';
import { Message } from '@phosphor/messaging';
import { ArrayExt } from '@phosphor/algorithm';
import { ElementExt } from '@phosphor/domutils';

/** The class name added to hidden content nodes, which are required to render vertical side bars. */
const HIDDEN_CONTENT_CLASS = 'theia-TabBar-hidden-content';

export const SHELL_TABBAR_CONTEXT_MENU: MenuPath = ['shell-tabbar-context-menu'];

export const TabBarRendererFactory = Symbol('TabBarRendererFactory');

export interface LabelRenderData {
    width: number;
    height: number;
    paddingTop: number;
    paddingBottom: number;
}

export interface SideBarRenderData extends TabBar.IRenderData<Widget> {
    labelData?: LabelRenderData;
}

/**
 * A tab bar renderer that offers a context menu.
 */
export class TabBarRenderer extends TabBar.Renderer {

    tabBar?: TabBar<Widget>;
    contextMenuPath?: MenuPath;

    constructor(protected readonly contextMenuRenderer: ContextMenuRenderer) {
        super();
    }

    renderTab(data: SideBarRenderData): VirtualElement {
        const title = data.title;
        const key = this.createTabKey(data);
        const style = this.createTabStyle(data);
        const className = this.createTabClass(data);
        const dataset = this.createTabDataset(data);
        return h.li(
            {
                key, className, title: title.caption, style, dataset,
                oncontextmenu: event => this.handleContextMenuEvent(event, title)
            },
            this.renderIcon(data),
            this.renderLabel(data),
            this.renderCloseIcon(data)
        );
    }

    createTabStyle({ zIndex, labelData }: SideBarRenderData): ElementInlineStyle {
        if (labelData) {
            const totalHeight = labelData.width + labelData.paddingTop + labelData.paddingBottom;
            return {
                zIndex: `${zIndex}`,
                height: `${totalHeight}px`
            };
        } else {
            return {
                zIndex: `${zIndex}`
            };
        }
    }

    renderLabel(data: SideBarRenderData): VirtualElement {
        let style: ElementInlineStyle | undefined;
        if (data.labelData) {
            style = {
                width: `${data.labelData.width}px`,
                height: `${data.labelData.height}px`,
            };
        }
        return h.div({ className: 'p-TabBar-tabLabel', style }, data.title.label);
    }

    protected handleContextMenuEvent(event: MouseEvent, title: Title<Widget>) {
        if (this.contextMenuPath) {
            event.stopPropagation();
            event.preventDefault();

            if (this.tabBar !== undefined) {
                this.tabBar.currentTitle = title;
                this.tabBar.activate();
                if (title.owner !== null) {
                    title.owner.activate();
                }
            }

            this.contextMenuRenderer.render(this.contextMenuPath, event);
        }
    }
}

/**
 * Data computed to determine drop targets.
 */
export interface TabBarDropTarget {
    index: number;
    lastRect?: ClientRect;
    nextRect?: ClientRect;
}

/**
 * A specialized tab bar for side areas.
 */
export class SideTabBar extends TabBar<Widget> {

    static readonly OVERLAY_PAD = 3;
    static readonly DRAG_THRESHOLD = 5;

    readonly tabAdded = new Signal<this, Title<Widget>>(this);
    readonly collapseRequested = new Signal<this, Title<Widget>>(this);

    protected overlay: DockPanel.Overlay;

    private mouseData?: {
        pressX: number,
        pressY: number,
        mouseDownTabIndex: number
    };

    constructor(options?: TabBar.IOptions<Widget>) {
        super(options);

        const hiddenContent = document.createElement('ul');
        hiddenContent.className = HIDDEN_CONTENT_CLASS;
        this.node.appendChild(hiddenContent);

        this.overlay = new DockPanel.Overlay();
        this.node.appendChild(this.overlay.node);
    }

    get hiddenContentNode(): HTMLUListElement {
        return this.node.getElementsByClassName(HIDDEN_CONTENT_CLASS)[0] as HTMLUListElement;
    }

    dispose(): void {
        this.overlay.hide(0);
        super.dispose();
    }

    insertTab(index: number, value: Title<Widget> | Title.IOptions<Widget>): Title<Widget> {
        const result = super.insertTab(index, value);
        this.tabAdded.emit(result);
        return result;
    }

    protected onUpdateRequest(msg: Message): void {
        this.renderTabs(this.hiddenContentNode);
        window.requestAnimationFrame(() => {
            const hiddenContent = this.hiddenContentNode;
            const n = hiddenContent.children.length;
            const labelData = new Array<LabelRenderData>(n);
            for (let i = 0; i < n; i++) {
                const hiddenTab = hiddenContent.children[i];
                const tabStyle = window.getComputedStyle(hiddenTab);
                const label = hiddenTab.getElementsByClassName('p-TabBar-tabLabel')[0];
                labelData[i] = {
                    width: label.clientWidth,
                    height: label.clientHeight,
                    paddingTop: parseFloat(tabStyle.paddingTop!) || 0,
                    paddingBottom: parseFloat(tabStyle.paddingBottom!) || 0
                };
            }
            this.renderTabs(this.contentNode, labelData);
        });
    }

    protected renderTabs(host: HTMLElement, labelData?: LabelRenderData[]): void {
        const titles = this.titles;
        const n = titles.length;
        const renderer = this.renderer as TabBarRenderer;
        const currentTitle = this.currentTitle;
        const content = new Array<VirtualElement>(n);
        for (let i = 0; i < n; i++) {
            const title = titles[i];
            const current = title === currentTitle;
            const zIndex = current ? n : n - i - 1;
            const labelDatum = labelData && i < labelData.length ? labelData[i] : undefined;
            content[i] = renderer.renderTab({ title, current, zIndex, labelData: labelDatum });
        }
        VirtualDOM.render(content, host);
    }

    protected showOverlay(clientX: number, clientY: number) {
        const barRect = this.node.getBoundingClientRect();
        const padding = SideTabBar.OVERLAY_PAD;
        const overlayWidth = barRect.width - 2 * padding;
        this.overlay.show({
            top: padding,
            bottom: barRect.height - (padding + overlayWidth),
            left: padding,
            right: padding
        });
    }

    protected onBeforeAttach(msg: Message): void {
        super.onBeforeAttach(msg);
        if (this.orientation === 'vertical') {
            this.node.addEventListener('p-dragenter', this);
            this.node.addEventListener('p-dragleave', this);
            this.node.addEventListener('p-dragover', this);
            this.node.addEventListener('p-drop', this);
        }
    }

    protected onAfterDetach(msg: Message): void {
        if (this.orientation === 'vertical') {
            this.node.removeEventListener('p-dragenter', this);
            this.node.removeEventListener('p-dragleave', this);
            this.node.removeEventListener('p-dragover', this);
            this.node.removeEventListener('p-drop', this);
        }
        super.onAfterDetach(msg);
    }

    handleEvent(event: Event): void {
        switch (event.type) {
            case 'mousedown':
                this.onMouseDown(event as MouseEvent);
                super.handleEvent(event);
                break;
            case 'mouseup':
                super.handleEvent(event);
                this.onMouseUp(event as MouseEvent);
                break;
            case 'mousemove':
                this.onMouseMove(event as MouseEvent);
                super.handleEvent(event);
                break;
            default:
                super.handleEvent(event);
        }
    }

    private onMouseDown(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || this.mouseData) {
            return;
        }

        // Check whether the mouse went down on the current tab
        const tabs = this.contentNode.children;
        const index = ArrayExt.findFirstIndex(tabs, tab => ElementExt.hitTest(tab, event.clientX, event.clientY));
        if (index !== this.currentIndex) {
            return;
        }

        // Check whether the close button was clicked
        const icon = tabs[index].querySelector(this.renderer.closeIconSelector);
        if (icon && icon.contains(event.target as HTMLElement)) {
            return;
        }

        this.mouseData = {
            pressX: event.clientX,
            pressY: event.clientY,
            mouseDownTabIndex: index
        };
    }

    private onMouseUp(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || !this.mouseData) {
            return;
        }

        // Check whether the mouse went up on the current tab
        const mouseDownTabIndex = this.mouseData.mouseDownTabIndex;
        this.mouseData = undefined;
        const tabs = this.contentNode.children;
        const index = ArrayExt.findFirstIndex(tabs, tab => ElementExt.hitTest(tab, event.clientX, event.clientY));
        if (index < 0 || index !== mouseDownTabIndex) {
            return;
        }

        // Collapse the side bar
        this.collapseRequested.emit(this.titles[index]);
    }

    private onMouseMove(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || !this.mouseData) {
            return;
        }

        const data = this.mouseData;
        const dx = Math.abs(event.clientX - data.pressX);
        const dy = Math.abs(event.clientY - data.pressY);
        const threshold = SideTabBar.DRAG_THRESHOLD;
        if (dx >= threshold || dy >= threshold) {
            this.mouseData = undefined;
        }
    }

}
