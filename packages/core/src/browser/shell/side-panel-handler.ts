/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { ArrayExt, find, map, toArray } from '@phosphor/algorithm';
import { TabBar, Widget, DockPanel, Title } from '@phosphor/widgets';
import { Signal } from '@phosphor/signaling';
import { MimeData } from '@phosphor/coreutils';
import { ElementExt } from '@phosphor/domutils';
import { Drag } from '@phosphor/dragdrop';
import { AttachedProperty } from '@phosphor/properties';
import { TabBarRendererFactory, TabBarRenderer, SHELL_TABBAR_CONTEXT_MENU } from './tab-bars';

/** The class name added to the main and bottom area panels. */
export const MAIN_BOTTOM_AREA_CLASS = 'theia-app-centers';
/** The class name added to the left and right area panels. */
export const LEFT_RIGHT_AREA_CLASS = 'theia-app-sides';

/** The class name added to collapsed side panels. */
const COLLAPSED_CLASS = 'theia-mod-collapsed';

export const SidePanelHandlerFactory = Symbol('SidePanelHandlerFactory');

const rankProperty = new AttachedProperty<Widget, number | undefined>({
    name: 'sidePanelRank',
    create: () => undefined
});

/**
 * A class which manages a dock panel and a related side bar.
 */
@injectable()
export class SidePanelHandler {

    @inject(TabBarRendererFactory) protected tabBarRendererFactory: () => TabBarRenderer;

    protected side: 'left' | 'right' | 'bottom';

    tabBar: SideTabBar;
    dockPanel: SideDockPanel;

    /**
     * Create the side bar and dock panel widgets.
     */
    create(side: 'left' | 'right' | 'bottom'): void {
        this.side = side;
        this.tabBar = this.createSideBar(side);
        this.dockPanel = this.createSidePanel(side);

        this.refreshVisibility();
    }

    protected createSideBar(side: 'left' | 'right' | 'bottom'): SideTabBar {
        const tabBarRenderer = this.tabBarRendererFactory();
        const sideBar = new SideTabBar({
            orientation: side === 'left' || side === 'right' ? 'vertical' : 'horizontal',
            insertBehavior: 'none',
            removeBehavior: 'none',
            allowDeselect: false,
            tabsMovable: true,
            renderer: tabBarRenderer
        });
        tabBarRenderer.tabBar = sideBar;
        tabBarRenderer.contextMenuPath = SHELL_TABBAR_CONTEXT_MENU;

        sideBar.addClass('theia-app-' + side);
        if (side === 'left' || side === 'right') {
            sideBar.addClass(LEFT_RIGHT_AREA_CLASS);
        } else {
            sideBar.addClass(MAIN_BOTTOM_AREA_CLASS);
        }

        sideBar.currentChanged.connect(this.onCurrentTabChanged, this);
        sideBar.tabActivateRequested.connect(this.onTabActivateRequested, this);
        sideBar.tabCloseRequested.connect(this.onTabCloseRequested, this);
        sideBar.tabDetachRequested.connect(this.onTabDetachRequested, this);
        sideBar.collapseRequested.connect(this.onCollapseRequested, this);
        return sideBar;
    }

    protected createSidePanel(side: 'left' | 'right' | 'bottom'): SideDockPanel {
        const sidePanel = new SideDockPanel({
            mode: 'single-document'
        });
        sidePanel.id = 'theia-' + side + '-stack';
        sidePanel.widgetAdded.connect(this.onWidgetAdded, this);
        sidePanel.widgetActivated.connect(this.onWidgetActivated, this);
        sidePanel.widgetRemoved.connect(this.onWidgetRemoved, this);
        return sidePanel;
    }

    getLayoutData(): SidePanel.LayoutData {
        const currentTitle = this.tabBar.currentTitle;
        const items = toArray(map(this.tabBar.titles, title => <SidePanel.WidgetItem>{
            widget: title.owner,
            rank: rankProperty.get(title.owner),
            expanded: title === currentTitle
        }));
        return { type: 'sidebar', items };
    }

    setLayoutData(layoutData: SidePanel.LayoutData) {
        this.tabBar.currentTitle = null;
        if (layoutData.items) {
            for (const item of layoutData.items) {
                if (item.widget) {
                    this.addWidget(item.widget, item);
                    if (item.expanded) {
                        this.tabBar.currentTitle = item.widget.title;
                    }
                }
            }
        }
        this.refreshVisibility();
    }

    /**
     * Activate a widget residing in the side panel by ID.
     *
     * @returns the activated widget if it was found
     */
    activate(id: string): Widget | undefined {
        const widget = this.expand(id);
        if (widget) {
            widget.activate();
        }
        return widget;
    }

    /**
     * Expand a widget residing in the side panel by ID.
     *
     * @returns the expanded widget if it was found
     */
    expand(id: string): Widget | undefined {
        const widget = find(this.dockPanel.widgets(), w => w.id === id);
        if (widget) {
            this.tabBar.currentTitle = widget.title;
            this.refreshVisibility();
        }
        return widget;
    }

    /**
     * Collapse the sidebar so no items are expanded.
     */
    collapse(): void {
        this.tabBar.currentTitle = null;
        this.refreshVisibility();
    }

    /**
     * Add a widget and its title to the dock panel and side bar.
     *
     * If the widget is already added, it will be moved.
     */
    addWidget(widget: Widget, options: SidePanel.WidgetOptions): void {
        if (options.rank) {
            rankProperty.set(widget, options.rank);
        }
        this.dockPanel.addWidget(widget);
    }

    /**
     * Refresh the visibility of the side bar and dock panel.
     */
    protected refreshVisibility(): void {
        const hideSideBar = this.tabBar.titles.length === 0;
        const currentTitle = this.tabBar.currentTitle;
        const hideDockPanel = currentTitle === null;
        if (this.dockPanel.parent) {
            this.dockPanel.parent.setHidden(hideSideBar && hideDockPanel);
            if (hideDockPanel) {
                this.dockPanel.parent.addClass(COLLAPSED_CLASS);
            } else {
                this.dockPanel.parent.removeClass(COLLAPSED_CLASS);
            }
        }
        this.tabBar.setHidden(hideSideBar);
        this.dockPanel.setHidden(hideDockPanel);
        if (currentTitle) {
            this.dockPanel.selectWidget(currentTitle.owner);
        }
    }

    /**
     * Handle a `currentChanged` signal from the sidebar.
     */
    protected onCurrentTabChanged(sender: SideTabBar, args: TabBar.ICurrentChangedArgs<Widget>): void {
        this.refreshVisibility();
    }

    /**
     * Handle a `tabActivateRequested` signal from the sidebar.
     */
    protected onTabActivateRequested(sender: SideTabBar, { title }: TabBar.ITabActivateRequestedArgs<Widget>): void {
        title.owner.activate();
    }

    /**
     * Handle a `tabCloseRequested` signal from the sidebar.
     */
    protected onTabCloseRequested(sender: SideTabBar, { title }: TabBar.ITabCloseRequestedArgs<Widget>): void {
        title.owner.close();
    }

    /**
     * Handle a `tabDetachRequested` signal from the sidebar.
     */
    protected onTabDetachRequested(sender: SideTabBar,
        { title, tab, clientX, clientY }: TabBar.ITabDetachRequestedArgs<Widget>): void {
        // Release the tab bar's hold on the mouse
        sender.releaseMouse();

        // Create and start a drag to move the selected tab to another panel
        const mimeData = new MimeData();
        mimeData.setData('application/vnd.phosphor.widget-factory', () => title.owner);
        const drag = new Drag({
            mimeData,
            dragImage: tab.cloneNode(true) as HTMLElement,
            proposedAction: 'move',
            supportedActions: 'move',
        });

        tab.classList.add('p-mod-hidden');
        drag.start(clientX, clientY).then(() => {
            tab.classList.remove('p-mod-hidden');
        });
    }

    /**
     * Handle a `collapseRequested` signal from the sidebar.
     */
    protected onCollapseRequested(sender: SideTabBar, title: Title<Widget>): void {
        this.collapse();
    }

    /*
     * Handle the `widgetAdded` signal from the dock panel.
     */
    protected onWidgetAdded(sender: DockPanel, widget: Widget): void {
        const rank = rankProperty.get(widget);
        const titles = this.tabBar.titles;
        let index = titles.length;
        if (rank !== undefined) {
            for (let i = index - 1; i >= 0; i--) {
                const r = rankProperty.get(titles[i].owner);
                if (r !== undefined && r > rank) {
                    index = i;
                }
            }
        }
        this.tabBar.insertTab(index, widget.title);
        this.refreshVisibility();
    }

    /*
     * Handle the `widgetActivated` signal from the dock panel.
     */
    protected onWidgetActivated(sender: DockPanel, widget: Widget): void {
        this.tabBar.currentTitle = widget.title;
        this.refreshVisibility();
    }

    /*
     * Handle the `widgetRemoved` signal from the dock panel.
     */
    protected onWidgetRemoved(sender: DockPanel, widget: Widget): void {
        if (this.tabBar.currentTitle === widget.title && this.side === 'bottom') {
            const titles = this.tabBar.titles;
            const index = ArrayExt.findFirstIndex(titles, title => title.owner === widget);
            if (index >= 0) {
                if (index < titles.length - 1) {
                    this.tabBar.currentTitle = titles[index + 1];
                } else if (index > 0) {
                    this.tabBar.currentTitle = titles[index - 1];
                }
            }
        }
        this.tabBar.removeTab(widget.title);
        this.refreshVisibility();
    }
}

export namespace SidePanel {
    /**
     * The options for adding a widget to a side panel.
     */
    export interface WidgetOptions {
        /**
         * The rank order of the widget among its siblings.
         */
        rank?: number;
    }

    /**
     * Data to save and load the layout of a side panel.
     */
    export interface LayoutData {
        type: 'sidebar',
        items?: WidgetItem[];
    }

    /**
     * Data structure used to save and restore the side panel layout.
     */
    export interface WidgetItem extends WidgetOptions {
        widget: Widget;

        /**
         * Whether the widget is expanded.
         */
        expanded?: boolean;
    }
}

/**
 * A specialized dock panel for side areas.
 */
export class SideDockPanel extends DockPanel {

    readonly widgetAdded = new Signal<this, Widget>(this);
    readonly widgetActivated = new Signal<this, Widget>(this);
    readonly widgetRemoved = new Signal<this, Widget>(this);

    addWidget(widget: Widget, options?: DockPanel.IAddOptions): void {
        if (widget.parent === this) {
            return;
        }
        super.addWidget(widget, options);
        this.widgetAdded.emit(widget);
    }

    activateWidget(widget: Widget): void {
        super.activateWidget(widget);
        this.widgetActivated.emit(widget);
    }

    protected onChildRemoved(msg: Widget.ChildMessage): void {
        super.onChildRemoved(msg);
        this.widgetRemoved.emit(msg.child);
    }

}

/**
 * A specialized tab bar for side areas.
 */
export class SideTabBar extends TabBar<Widget> {

    readonly collapseRequested = new Signal<this, Title<Widget>>(this);

    private mouseDownTabIndex = -1;

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
