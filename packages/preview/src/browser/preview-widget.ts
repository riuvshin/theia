/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    inject,
    injectable
} from "inversify";
import {
    Resource,
    DisposableCollection,
    Disposable
} from '@theia/core';
import {
    BaseWidget,
    Message,
    StatefulWidget
} from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import {
    ResourceProvider,
    Event,
    Emitter
} from '@theia/core/lib/common';
import {
    Workspace,
    TextDocument,
    DidChangeTextDocumentParams
} from "@theia/languages/lib/common";
import {
    PreviewHandler,
    PreviewHandlerProvider
} from './preview-handler';

export const PREVIEW_WIDGET_CLASS = 'theia-preview-widget';

export const PREVIEW_WIDGET_FACTORY_ID = 'preview-widget';

const DEFAULT_ICON = 'fa fa-eye';

@injectable()
export class PreviewWidget extends BaseWidget implements StatefulWidget {

    protected resource: Resource | undefined;
    protected previewHandler: PreviewHandler | undefined;
    protected readonly previewDisposables = new DisposableCollection();
    protected readonly onDidScrollEmitter = new Emitter<number>();

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(Workspace)
    protected readonly workspace: Workspace;

    @inject(PreviewHandlerProvider)
    protected readonly previewHandlerProvider: PreviewHandlerProvider;

    constructor(
    ) {
        super();
        this.id = 'preview';
        this.title.iconClass = DEFAULT_ICON;
        this.title.closable = true;
        this.addClass(PREVIEW_WIDGET_CLASS);
        this.node.tabIndex = 0;
        this.startScrollSync();
        this.update();
    }

    protected scrollSyncTimer: number | undefined = undefined;
    protected startScrollSync(): void {
        this.node.addEventListener('scroll', event => {
            if (this.scrollSyncTimer) {
                window.clearTimeout(this.scrollSyncTimer);
            }
            this.scrollSyncTimer = window.setTimeout(() => {
                const scrollTop = this.node.scrollTop;
                this.didScroll(scrollTop);
            }, 200);
        });
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.update();
    }

    onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (this.resource) {
            const uri = this.resource.uri;
            const document = this.workspace.textDocuments.find(d => d.uri === uri.toString());
            if (document) {
                const contents = document.getText();
                this.renderHTML(contents).then(html => this.node.innerHTML = html);
            } else {
                this.resource.readContents().then(async contents => {
                    this.node.innerHTML = await this.renderHTML(contents);
                });
            }
        }
    }

    protected async renderHTML(content: string): Promise<string> {
        if (!this.previewHandler) {
            return '';
        }
        const renderedHTML = await this.previewHandler.renderHTML(content);
        return renderedHTML || '';
    }

    storeState(): object {
        if (this.resource) {
            return { uri: this.resource.uri.toString() };
        }
        return {};
    }

    restoreState(oldState: object) {
        const state = oldState as any;
        if (state.uri) {
            const uri = new URI(state.uri);
            this.start(uri);
        }
    }

    dispose(): void {
        super.dispose();
        this.previewDisposables.dispose();
    }

    async start(uri: URI): Promise<void> {
        const previewHandler = this.previewHandler = this.previewHandlerProvider.findContribution(uri)[0];
        if (!previewHandler) {
            return;
        }
        this.previewDisposables.dispose();
        const resource = this.resource = await this.resourceProvider(uri);
        this.previewDisposables.push(resource);
        if (resource.onDidChangeContents) {
            this.previewDisposables.push(resource.onDidChangeContents(() => this.update()));
        }
        const updateIfAffected = (affectedUri?: string) => {
            if (!affectedUri || affectedUri === uri.toString()) {
                this.update();
            }
        };
        this.previewDisposables.push(this.workspace.onDidOpenTextDocument((document: TextDocument) => updateIfAffected(document.uri)));
        this.previewDisposables.push(this.workspace.onDidChangeTextDocument((params: DidChangeTextDocumentParams) => updateIfAffected(params.textDocument.uri)));
        this.previewDisposables.push(this.workspace.onDidCloseTextDocument((document: TextDocument) => updateIfAffected(document.uri)));

        const contentClass = previewHandler.contentClass;
        this.addClass(contentClass);
        this.previewDisposables.push(Disposable.create(() => {
            this.removeClass(contentClass);
        }));

        this.title.label = `${uri.path.base} preview`;
        this.title.iconClass = previewHandler.iconClass || DEFAULT_ICON;
        this.title.caption = this.title.label;
        this.title.closable = true;
        this.update();
    }

    get uri(): URI | undefined {
        return (this.resource) ? this.resource.uri : undefined;
    }

    revealForSourceLine(sourceLine: number): void {
        if (!this.previewHandler) {
            return;
        }
        const elementToReveal = this.previewHandler.findElementForSourceLine(sourceLine, this.node);
        if (elementToReveal) {
            elementToReveal.scrollIntoView({ behavior: 'smooth' });
        }
    }

    get onDidScroll(): Event<number> {
        return this.onDidScrollEmitter.event;
    }

    protected fireDidScrollToSourceLine(line: number): void {
        this.onDidScrollEmitter.fire(line);
    }

    protected didScroll(scrollTop: number): void {
        if (!this.previewHandler) {
            return;
        }
        const child = this.getChildAtOffsetTop(scrollTop);
        if (!child) {
            return;
        }
        const line = this.previewHandler.getSourceLineForElement(child);
        if (!line) {
            return;
        }
        this.fireDidScrollToSourceLine(line);
    }

    protected getChildAtOffsetTop(y: number): HTMLElement | undefined {
        let child = this.node.firstElementChild as HTMLElement | null;
        while (child && y > child.offsetTop) {
            child = child.nextElementSibling as HTMLElement | null;
        }
        return child ? child : undefined;
    }

}
