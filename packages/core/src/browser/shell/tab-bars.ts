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
import { IDragEvent } from '@phosphor/dragdrop';

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
                minHeight: `${data.labelData.height}px`
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

const OVERLAY_PAD = 3;

/**
 * A specialized tab bar for side areas.
 */
export class SideTabBar extends TabBar<Widget> {

    readonly tabAdded = new Signal<this, Title<Widget>>(this);
    readonly collapseRequested = new Signal<this, Title<Widget>>(this);

    protected overlay: DockPanel.Overlay;

    private mouseDownTabIndex = -1;

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
        const overlayWidth = barRect.width - 2 * OVERLAY_PAD;
        this.overlay.show({
            top: OVERLAY_PAD,
            bottom: barRect.height - (OVERLAY_PAD + overlayWidth),
            left: OVERLAY_PAD,
            right: OVERLAY_PAD
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
            case 'p-dragenter':
                this.onDragEnter(event as IDragEvent);
                break;
            case 'p-dragleave':
                this.onDragLeave(event as IDragEvent);
                break;
            case 'p-dragover':
                this.onDragOver(event as IDragEvent);
                break;
            case 'p-drop':
                this.onDrop(event as IDragEvent);
                break;
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

    private onDragEnter(event: IDragEvent): void {
        if (event.mimeData.hasData('application/vnd.phosphor.widget-factory')) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private onDragOver(event: IDragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        // Don't accept any drop if the bar is not empty
        // (in that case you can drop into the related dock panel)
        if (this.titles.length > 0) {
            event.dropAction = 'none';
        } else {
            this.showOverlay(event.clientX, event.clientY);
            event.dropAction = event.proposedAction;
        }
    }

    private onDragLeave(event: IDragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const related = event.relatedTarget as HTMLElement;
        if (!related || !this.node.contains(related)) {
            this.overlay.hide(0);
        }
    }

    private onDrop(event: IDragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        this.overlay.hide(0);

        // Don't accept any drop if the bar is not empty
        // (in that case you can drop into the related dock panel)
        if (this.titles.length > 0 || event.proposedAction === 'none') {
            event.dropAction = 'none';
            return;
        }

        // Create a widget from the event mime data
        const factory = event.mimeData.getData('application/vnd.phosphor.widget-factory');
        if (typeof factory !== 'function') {
            event.dropAction = 'none';
            return;
        }
        const widget = factory();
        if (!(widget instanceof Widget)) {
            event.dropAction = 'none';
            return;
        }
        if (widget.contains(this)) {
            event.dropAction = 'none';
            return;
        }

        // Accept the drop and add the widget
        event.dropAction = event.proposedAction;
        this.addTab(widget.title);
        this.currentTitle = widget.title;
    }

    private onMouseDown(event: MouseEvent): void {
        // Check for left mouse button and current drag status
        if (event.button !== 0 || (this as any)._dragData) {
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

        this.mouseDownTabIndex = index;
    }

    private onMouseUp(event: MouseEvent): void {
        // Check for left mouse button
        if (event.button !== 0) {
            return;
        }

        // Check whether the mouse went up on the current tab
        const mouseDownTabIndex = this.mouseDownTabIndex;
        this.mouseDownTabIndex = -1;
        const tabs = this.contentNode.children;
        const index = ArrayExt.findFirstIndex(tabs, tab => ElementExt.hitTest(tab, event.clientX, event.clientY));
        if (index < 0 || index !== mouseDownTabIndex) {
            return;
        }

        // Collapse the side bar
        this.collapseRequested.emit(this.titles[index]);
    }

    private onMouseMove(event: MouseEvent): void {
        // Check for left mouse button
        if (event.button !== 0) {
            return;
        }

        this.mouseDownTabIndex = -1;
    }

}
