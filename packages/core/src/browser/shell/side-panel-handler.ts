/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { ArrayExt, find, map, toArray } from '@phosphor/algorithm';
import { TabBar, Widget, DockPanel } from '@phosphor/widgets';
import { Signal } from '@phosphor/signaling';
import { TabBarRendererFactory, TabBarRenderer, SHELL_TABBAR_CONTEXT_MENU } from './tab-bars';

/** The class name added to the main and bottom area panels. */
export const MAIN_BOTTOM_AREA_CLASS = 'theia-app-centers';
/** The class name added to the left and right area panels. */
export const LEFT_RIGHT_AREA_CLASS = 'theia-app-sides';

/** The class name added to collapsed side panels. */
const COLLAPSED_CLASS = 'theia-mod-collapsed';

export const SidePanelHandlerFactory = Symbol('SidePanelHandlerFactory');

/**
 * A specialized dock panel for use in side bars.
 */
class SideDockPanel extends DockPanel {

    readonly widgetAdded = new Signal<this, Widget>(this);
    readonly widgetActivated = new Signal<this, Widget>(this);
    readonly widgetRemoved = new Signal<this, Widget>(this);

    addWidget(widget: Widget, options?: DockPanel.IAddOptions): void {
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
 * A class which manages a dock panel and a related side bar.
 */
@injectable()
export class SidePanelHandler {

    @inject(TabBarRendererFactory) protected tabBarRendererFactory: () => TabBarRenderer;

    protected side: 'left' | 'right' | 'bottom';

    sideBar: TabBar<Widget>;
    dockPanel: DockPanel;

    /**
     * Create the side bar and dock panel widgets.
     */
    create(side: 'left' | 'right' | 'bottom') {
        this.side = side;
        const tabBarRenderer = this.tabBarRendererFactory();
        const sideBar = new TabBar<Widget>({
            orientation: side === 'left' || side === 'right' ? 'vertical' : 'horizontal',
            insertBehavior: 'none',
            removeBehavior: 'none',
            allowDeselect: true,
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
        sideBar.currentChanged.connect(this.onCurrentChanged, this);
        sideBar.tabActivateRequested.connect(this.onTabActivateRequested, this);
        sideBar.tabCloseRequested.connect(this.onTabCloseRequested, this);
        this.sideBar = sideBar;

        const dockPanel = new SideDockPanel({
            mode: 'single-document'
        });
        dockPanel.id = 'theia-' + side + '-stack';
        dockPanel.widgetAdded.connect(this.onWidgetAdded, this);
        dockPanel.widgetActivated.connect(this.onWidgetActivated, this);
        dockPanel.widgetRemoved.connect(this.onWidgetRemoved, this);
        this.dockPanel = dockPanel;

        this.refreshVisibility();
    }

    getLayoutData(): SidePanel.LayoutData {
        const currentTitle = this.sideBar.currentTitle;
        const items = toArray(map(this.sideBar.titles, title => <SidePanel.WidgetItem>{
            widget: title.owner,
            rank: this.getRank(title.owner),
            expanded: title === currentTitle
        }));
        return { type: 'sidebar', items };
    }

    setLayoutData(layoutData: SidePanel.LayoutData) {
        this.sideBar.currentTitle = null;
        if (layoutData.items) {
            for (const item of layoutData.items) {
                if (item.widget) {
                    this.addWidget(item.widget, item);
                    if (item.expanded) {
                        this.sideBar.currentTitle = item.widget.title;
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
            this.sideBar.currentTitle = widget.title;
            this.refreshVisibility();
        }
        return widget;
    }

    /**
     * Collapse the sidebar so no items are expanded.
     */
    collapse(): void {
        this.sideBar.currentTitle = null;
        this.refreshVisibility();
    }

    /**
     * Add a widget and its title to the dock panel and side bar.
     *
     * If the widget is already added, it will be moved.
     */
    addWidget(widget: Widget, options: SidePanel.WidgetOptions): void {
        if (options.rank) {
            this.setRank(widget, options.rank);
        }
        this.dockPanel.addWidget(widget);
    }

    protected getRank(widget: Widget): number | undefined {
        return (widget as any)._sidePanelRank;
    }

    private setRank(widget: Widget, rank: number): void {
        (widget as any)._sidePanelRank = rank;
    }

    /**
     * Refresh the visibility of the side bar and dock panel.
     */
    protected refreshVisibility(): void {
        const hideSideBar = this.sideBar.titles.length === 0;
        const currentTitle = this.sideBar.currentTitle;
        const hideDockPanel = currentTitle === null;
        if (this.dockPanel.parent) {
            this.dockPanel.parent.setHidden(hideSideBar && hideDockPanel);
            if (hideDockPanel) {
                this.dockPanel.parent.addClass(COLLAPSED_CLASS);
            } else {
                this.dockPanel.parent.removeClass(COLLAPSED_CLASS);
            }
        }
        this.sideBar.setHidden(hideSideBar);
        this.dockPanel.setHidden(hideDockPanel);
        for (const title of this.sideBar.titles) {
            title.owner.setHidden(title !== currentTitle);
        }
        if (currentTitle) {
            this.dockPanel.selectWidget(currentTitle.owner);
        }
    }

    /**
     * Handle the `currentChanged` signal from the sidebar.
     */
    protected onCurrentChanged(sender: TabBar<Widget>, args: TabBar.ICurrentChangedArgs<Widget>): void {
        this.refreshVisibility();
    }

    /**
     * Handle a `tabActivateRequest` signal from the sidebar.
     */
    protected onTabActivateRequested(sender: TabBar<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>): void {
        args.title.owner.activate();
    }

    /**
     * Handle a `tabCloseRequest` signal from the sidebar.
     */
    protected onTabCloseRequested(sender: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>): void {
        args.title.owner.close();
    }

    /*
     * Handle the `widgetAdded` signal from the dock panel.
     */
    protected onWidgetAdded(sender: DockPanel, widget: Widget): void {
        const rank = this.getRank(widget);
        const titles = this.sideBar.titles;
        let index = titles.length;
        if (rank !== undefined) {
            for (let i = index - 1; i >= 0; i--) {
                const r = this.getRank(titles[i].owner);
                if (r !== undefined && r > rank) {
                    index = i;
                }
            }
        }
        this.sideBar.insertTab(index, widget.title);
        this.refreshVisibility();
    }

    /*
     * Handle the `widgetActivated` signal from the dock panel.
     */
    protected onWidgetActivated(sender: DockPanel, widget: Widget): void {
        this.sideBar.currentTitle = widget.title;
        this.refreshVisibility();
    }

    /*
     * Handle the `widgetRemoved` signal from the dock panel.
     */
    protected onWidgetRemoved(sender: DockPanel, widget: Widget): void {
        if (this.sideBar.currentTitle === widget.title && this.side === 'bottom') {
            const titles = this.sideBar.titles;
            const index = ArrayExt.findFirstIndex(titles, title => title.owner === widget);
            if (index >= 0) {
                if (index < titles.length - 1) {
                    this.sideBar.currentTitle = titles[index + 1];
                } else if (index > 0) {
                    this.sideBar.currentTitle = titles[index - 1];
                }
            }
        }
        this.sideBar.removeTab(widget.title);
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
