/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    interfaces,
    injectable
} from 'inversify';
import { DisposableCollection } from '@theia/core';
import {
    WidgetFactory,
} from '@theia/core/lib/browser';
import {
    Emitter,
    Event,
} from '@theia/core/lib/common';
import {
    PreviewWidget,
    PREVIEW_WIDGET_FACTORY_ID
} from './preview-widget';

@injectable()
export class PreviewWidgetManager implements WidgetFactory {

    readonly id: string = PREVIEW_WIDGET_FACTORY_ID;

    protected readonly onWidgetCreatedEmitter = new Emitter<string>();

    protected readonly disposables = new DisposableCollection();
    private widgets = new Map<string, PreviewWidget>();

    constructor(
        protected readonly container: interfaces.Container
    ) { }

    async createWidget(uri: string): Promise<PreviewWidget> {
        const previewWidget = this.widgets.get(uri);
        if (previewWidget) {
            return previewWidget;
        }
        const newWidget = this.container.get(PreviewWidget);
        this.widgets.set(uri, newWidget);
        newWidget.disposed.connect(() => {
            this.widgets.delete(uri);
        });
        this.fireWidgetCreated(uri);
        return newWidget;
    }

    get(uri: string): PreviewWidget | undefined {
        return this.widgets.get(uri);
    }

    get onWidgetCreated(): Event<string> {
        return this.onWidgetCreatedEmitter.event;
    }

    protected fireWidgetCreated(uri: string): void {
        this.onWidgetCreatedEmitter.fire(uri);
    }

}
