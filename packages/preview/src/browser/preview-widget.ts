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
    DisposableCollection
} from '@theia/core';
import {
    BaseWidget,
    Message,
    StatefulWidget
} from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import {
    ResourceProvider,
    Disposable
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

@injectable()
export class PreviewWidget extends BaseWidget implements StatefulWidget {

    protected resource: Resource | undefined;
    protected previewHandler: PreviewHandler | undefined;
    protected readonly resourceDisposibles = new DisposableCollection();

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
            this.resource.readContents().then(contents => {
                this.node.innerHTML = this.renderHTML(contents);
            });
        }
    }

    protected renderHTML(content: string): string {
        return (this.previewHandler) ? this.previewHandler.renderHTML(content) : '';
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
        this.resourceDisposibles.dispose();
    }

    async start(uri: URI): Promise<void> {
        const previewHandler = this.previewHandler = this.previewHandlerProvider.get(uri);
        if (!previewHandler) {
            return;
        }
        this.resourceDisposibles.dispose();
        const resource = this.resource = await this.resourceProvider(uri);
        this.resourceDisposibles.push(resource);
        if (resource.onDidChangeContents) {
            this.resourceDisposibles.push(resource.onDidChangeContents(() => this.update()));
        }
        const updateIfAffected = (affectedUri?: string) => {
            if (!affectedUri || affectedUri === uri.toString()) {
                this.update();
            }
        };
        this.resourceDisposibles.push(this.workspace.onDidOpenTextDocument((document: TextDocument) => updateIfAffected(document.uri)));
        this.resourceDisposibles.push(this.workspace.onDidChangeTextDocument((params: DidChangeTextDocumentParams) => updateIfAffected(params.textDocument.uri)));
        this.resourceDisposibles.push(this.workspace.onDidCloseTextDocument((document: TextDocument) => updateIfAffected(document.uri)));

        this.title.label = `Preview '${uri.path.base}'`;
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

    didScrollToLine: ((line: number) => void) | undefined;
    addDidScrollToLineHandler(handler: (line: number) => void): Disposable {
        this.didScrollToLine = handler;
        return Disposable.create(() => {
            this.didScrollToLine = undefined;
        });
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
        if (this.didScrollToLine) {
            this.didScrollToLine(line);
        }
    }

    protected getChildAtOffsetTop(y: number): HTMLElement | undefined {
        let child = this.node.firstElementChild as HTMLElement | null;
        while (child && y > child.offsetTop) {
            child = child.nextElementSibling as HTMLElement | null;
        }
        return child ? child : undefined;
    }

}
