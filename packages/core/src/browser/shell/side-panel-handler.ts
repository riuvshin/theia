/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { find, map, toArray, some } from '@phosphor/algorithm';
import { TabBar, Widget, DockPanel, Title, Panel, BoxPanel, BoxLayout, SplitPanel, SplitLayout } from '@phosphor/widgets';
import { Signal } from '@phosphor/signaling';
import { MimeData } from '@phosphor/coreutils';
import { Drag } from '@phosphor/dragdrop';
import { AttachedProperty } from '@phosphor/properties';
import { TabBarRendererFactory, TabBarRenderer, SHELL_TABBAR_CONTEXT_MENU, SideTabBar } from './tab-bars';

/** The class name added to the main and bottom area panels. */
export const MAIN_BOTTOM_AREA_CLASS = 'theia-app-centers';
/** The class name added to the left and right area panels. */
export const LEFT_RIGHT_AREA_CLASS = 'theia-app-sides';

/** The class name added to collapsed side panels. */
const COLLAPSED_CLASS = 'theia-mod-collapsed';

export const SidePanelHandlerFactory = Symbol('SidePanelHandlerFactory');

/**
 * A class which manages a dock panel and a related side bar.
 */
@injectable()
export class SidePanelHandler {

    private static readonly rankProperty = new AttachedProperty<Widget, number | undefined>({
        name: 'sidePanelRank',
        create: () => undefined
    });

    private static readonly globalHandlers: SidePanelHandler[] = [];

    @inject(TabBarRendererFactory) protected tabBarRendererFactory: () => TabBarRenderer;

    protected side: 'left' | 'right' | 'bottom';
    protected lastActiveTabIndex: number = -1;
    protected lastSplitPosition: number = -1;

    tabBar: SideTabBar;
    dockPanel: TheiaDockPanel;
    container: Panel;

    /**
     * Create the side bar and dock panel widgets.
     */
    create(side: 'left' | 'right' | 'bottom'): void {
        this.side = side;
        this.tabBar = this.createSideBar();
        this.dockPanel = this.createSidePanel();
        this.container = this.createContainer();

        SidePanelHandler.globalHandlers.push(this);
        this.container.disposed.connect(() => {
            const index = SidePanelHandler.globalHandlers.indexOf(this);
            if (index >= 0) {
                SidePanelHandler.globalHandlers.splice(index, 1);
            }
        });

        this.refreshVisibility();
    }

    protected createSideBar(): SideTabBar {
        const side = this.side;
        const tabBarRenderer = this.tabBarRendererFactory();
        const sideBar = new SideTabBar({
            orientation: side === 'left' || side === 'right' ? 'vertical' : 'horizontal',
            insertBehavior: 'none',
            removeBehavior: 'select-previous-tab',
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

        sideBar.tabAdded.connect(this.onTabAdded, this);
        sideBar.currentChanged.connect(this.onCurrentTabChanged, this);
        sideBar.tabActivateRequested.connect(this.onTabActivateRequested, this);
        sideBar.tabCloseRequested.connect(this.onTabCloseRequested, this);
        sideBar.tabDetachRequested.connect(this.onTabDetachRequested, this);
        sideBar.collapseRequested.connect(this.onCollapseRequested, this);
        return sideBar;
    }

    protected createSidePanel(): TheiaDockPanel {
        const sidePanel = new TheiaDockPanel({
            mode: 'single-document'
        });
        sidePanel.id = 'theia-' + this.side + '-stack';
        sidePanel.widgetAdded.connect(this.onWidgetAdded, this);
        sidePanel.widgetActivated.connect(this.onWidgetActivated, this);
        sidePanel.widgetRemoved.connect(this.onWidgetRemoved, this);
        return sidePanel;
    }

    protected createContainer(): Panel {
        const side = this.side;
        let direction: BoxLayout.Direction;
        switch (side) {
            case 'left':
                direction = 'left-to-right';
                break;
            case 'right':
                direction = 'right-to-left';
                break;
            case 'bottom':
                direction = 'top-to-bottom';
                break;
            default:
                throw new Error('Illegal argument: ' + side);
        }
        const boxLayout = new BoxLayout({ direction, spacing: 0 });
        BoxPanel.setStretch(this.tabBar, 0);
        boxLayout.addWidget(this.tabBar);
        BoxPanel.setStretch(this.dockPanel, 1);
        boxLayout.addWidget(this.dockPanel);
        const boxPanel = new BoxPanel({ layout: boxLayout });
        boxPanel.id = 'theia-' + side + '-content-panel';
        return boxPanel;
    }

    getLayoutData(): SidePanel.LayoutData {
        const currentTitle = this.tabBar.currentTitle;
        const items = toArray(map(this.tabBar.titles, title => <SidePanel.WidgetItem>{
            widget: title.owner,
            rank: SidePanelHandler.rankProperty.get(title.owner),
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
     * Expand a widget residing in the side panel by ID. If no ID is given and the panel is
     * currently collapsed, the last active tab of this side panel is expanded. If no tab
     * was expanded previously, the first one is taken.
     *
     * @returns the expanded widget if it was found
     */
    expand(id?: string): Widget | undefined {
        if (id) {
            const widget = find(this.dockPanel.widgets(), w => w.id === id);
            if (widget) {
                this.tabBar.currentTitle = widget.title;
            }
            return widget;
        } else if (this.tabBar.titles.length > 0 && !this.tabBar.currentTitle) {
            let index = this.lastActiveTabIndex;
            if (index < 0) {
                index = 0;
            } else if (index >= this.tabBar.titles.length) {
                index = this.tabBar.titles.length - 1;
            }
            const title = this.tabBar.titles[index];
            this.tabBar.currentTitle = title;
            return title.owner;
        }
    }

    /**
     * Collapse the sidebar so no items are expanded.
     */
    collapse(): void {
        this.tabBar.currentTitle = null;
    }

    /**
     * Add a widget and its title to the dock panel and side bar.
     *
     * If the widget is already added, it will be moved.
     */
    addWidget(widget: Widget, options: SidePanel.WidgetOptions): void {
        if (options.rank) {
            SidePanelHandler.rankProperty.set(widget, options.rank);
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
        if (hideDockPanel) {
            this.container.addClass(COLLAPSED_CLASS);
            this.savePanelWidth();
        } else {
            this.container.removeClass(COLLAPSED_CLASS);
            if (this.dockPanel.isHidden) {
                this.restorePanelWidth();
            }
        }
        this.container.setHidden(hideSideBar && hideDockPanel);
        this.tabBar.setHidden(hideSideBar);
        this.dockPanel.setHidden(hideDockPanel);
        if (currentTitle) {
            this.dockPanel.selectWidget(currentTitle.owner);
        }
    }

    protected savePanelWidth() {
        const parent = this.container.parent;
        if (parent instanceof SplitPanel) {
            let index = parent.widgets.indexOf(this.container);
            if (this.side === 'right') {
                index--;
            }
            const handle = parent.handles[index];
            this.lastSplitPosition = handle.offsetLeft;
        }
    }

    protected restorePanelWidth() {
        const parent = this.container.parent;
        let position = this.lastSplitPosition;
        if (parent instanceof SplitPanel && position > 0) {
            let index = parent.widgets.indexOf(this.container);
            if (this.side === 'right') {
                index--;
            }

            const parentWidth = parent.node.clientWidth;
            const maxWidth = parentWidth / 3;
            if (this.side === 'left' && position > maxWidth) {
                position = maxWidth;
            } else if (this.side === 'right' && position < parentWidth - maxWidth) {
                position = parentWidth - maxWidth;
            }

            window.requestAnimationFrame(() => {
                (parent.layout as SplitLayout).moveHandle(index, position);
            });
        }
    }

    /**
     * Handle a `tabAdded` signal from the sidebar.
     */
    protected onTabAdded(sender: SideTabBar, title: Title<Widget>): void {
        const widget = title.owner;
        if (!some(this.dockPanel.widgets(), w => w === widget)) {
            this.dockPanel.addWidget(widget);
        }
    }

    /**
     * Handle a `currentChanged` signal from the sidebar.
     */
    protected onCurrentTabChanged(sender: SideTabBar, { currentTitle, currentIndex }: TabBar.ICurrentChangedArgs<Widget>): void {
        if (currentIndex >= 0) {
            this.lastActiveTabIndex = currentIndex;
        }
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

        // Make all side bars visible so we can drag the detached widget into them
        const previousState = SidePanelHandler.showAllSideBars();

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
            SidePanelHandler.resetAllSideBars(previousState, title);
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
        const titles = this.tabBar.titles;
        if (!find(titles, t => t.owner === widget)) {
            const rank = SidePanelHandler.rankProperty.get(widget);
            let index = titles.length;
            if (rank !== undefined) {
                for (let i = index - 1; i >= 0; i--) {
                    const r = SidePanelHandler.rankProperty.get(titles[i].owner);
                    if (r !== undefined && r > rank) {
                        index = i;
                    }
                }
            }
            this.tabBar.insertTab(index, widget.title);
            this.refreshVisibility();
        }
    }

    /*
     * Handle the `widgetActivated` signal from the dock panel.
     */
    protected onWidgetActivated(sender: DockPanel, widget: Widget): void {
        this.tabBar.currentTitle = widget.title;
    }

    /*
     * Handle the `widgetRemoved` signal from the dock panel.
     */
    protected onWidgetRemoved(sender: DockPanel, widget: Widget): void {
        this.tabBar.removeTab(widget.title);
        this.refreshVisibility();
    }

    static showAllSideBars(): SidePanel.SideBarState[] {
        const previousState: SidePanel.SideBarState[] = [];
        for (const handler of SidePanelHandler.globalHandlers) {
            previousState.push({
                isExpanded: handler.tabBar.currentTitle !== null
            });
            if (handler.container.isAttached) {
                if (handler.tabBar.titles.length > 0) {
                    handler.expand();
                } else {
                    handler.container.show();
                    handler.tabBar.show();
                }
            }
        }
        return previousState;
    }

    static resetAllSideBars(previousState: SidePanel.SideBarState[] = [], activeTitle?: Title<Widget>): void {
        for (let i = 0; i < SidePanelHandler.globalHandlers.length; i++) {
            const handler = SidePanelHandler.globalHandlers[i];
            const state = i < previousState.length ? previousState[i] : undefined;
            if (handler.container.isAttached) {
                if (state) {
                    if (state.isExpanded) {
                        handler.expand();
                    } else if (!activeTitle || handler.tabBar.currentTitle !== activeTitle) {
                        handler.collapse();
                    }
                }
                handler.refreshVisibility();
            }
        }
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

    export interface SideBarState {
        isExpanded: boolean;
    }
}

/**
 * A specialized dock panel that supports side areas.
 */
export class TheiaDockPanel extends DockPanel {

    private __drag?: Drag;
    private __draggedWidget?: Widget;
    private previousSideBarState?: SidePanel.SideBarState[];

    constructor(options?: DockPanel.IOptions) {
        super(options);
        // Override the _drag property from DockPanel with an accessor property
        Object.defineProperty(this, '_drag', {
            get: () => this.__drag,
            set: (drag: Drag) => {
                if (drag) {
                    // A drag has been started
                    window.requestAnimationFrame(() => {
                        this.previousSideBarState = SidePanelHandler.showAllSideBars();
                    });
                    const factory = drag.mimeData.getData('application/vnd.phosphor.widget-factory');
                    if (typeof factory === 'function') {
                        const widget = factory();
                        if (widget instanceof Widget) {
                            this.__draggedWidget = widget;
                        }
                    }
                } else {
                    // A drag has been completed
                    const activeTitle = this.__draggedWidget ? this.__draggedWidget.title : undefined;
                    SidePanelHandler.resetAllSideBars(this.previousSideBarState, activeTitle);
                    this.previousSideBarState = undefined;
                    this.__draggedWidget = undefined;
                }
                this.__drag = drag;
            }
        });
    }

    readonly widgetAdded = new Signal<this, Widget>(this);
    readonly widgetActivated = new Signal<this, Widget>(this);
    readonly widgetRemoved = new Signal<this, Widget>(this);

    addWidget(widget: Widget, options?: DockPanel.IAddOptions): void {
        if (this.mode === 'single-document' && widget.parent === this) {
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
