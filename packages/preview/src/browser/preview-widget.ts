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
    Emitter,
} from '@theia/core/lib/common';
import {
    Workspace,
    TextDocument,
    DidChangeTextDocumentParams,
    Location,
    Range,
} from "@theia/languages/lib/common";
import {
    PreviewHandler,
    PreviewHandlerProvider
} from './preview-handler';
import { throttle } from 'throttle-debounce';

export const PREVIEW_WIDGET_CLASS = 'theia-preview-widget';

export const PREVIEW_WIDGET_FACTORY_ID = 'preview-widget';

const DEFAULT_ICON = 'fa fa-eye';

let widgetCounter: number = 0;

@injectable()
export class PreviewWidget extends BaseWidget implements StatefulWidget {

    protected resource: Resource | undefined;
    protected previewHandler: PreviewHandler | undefined;
    protected readonly previewDisposables = new DisposableCollection();
    protected readonly onDidScrollEmitter = new Emitter<number>();
    protected readonly onDidDoubleClickEmitter = new Emitter<Location>();

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(Workspace)
    protected readonly workspace: Workspace;

    @inject(PreviewHandlerProvider)
    protected readonly previewHandlerProvider: PreviewHandlerProvider;

    constructor(
    ) {
        super();
        this.id = 'preview-' + widgetCounter++;
        this.title.iconClass = DEFAULT_ICON;
        this.title.closable = true;
        this.addClass(PREVIEW_WIDGET_CLASS);
        this.node.tabIndex = 0;
        this.startScrollSync();
        this.startDoubleClickListener();
        this.update();
    }

    protected preventScrollNotification: boolean = false;
    protected startScrollSync(): void {
        this.node.addEventListener('scroll', throttle(50, (event: UIEvent) => {
            if (this.preventScrollNotification) {
                return;
            }
            const scrollTop = this.node.scrollTop;
            this.didScroll(scrollTop);
        }));
    }

    protected startDoubleClickListener(): void {
        this.node.addEventListener('dblclick', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            let node: HTMLElement | null = target;
            while (node && node instanceof HTMLElement) {
                if (node.tagName === 'A') {
                    return;
                }
                node = node.parentElement;
            }
            const offsetParent = target.offsetParent as HTMLElement;
            const offset = offsetParent.classList.contains(PREVIEW_WIDGET_CLASS) ? target.offsetTop : offsetParent.offsetTop;
            this.didDoubleClick(offset);
        });
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        this.update();
    }

    onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (this.resource) {
            const uri = this.resource.uri;
            const document = this.workspace.textDocuments.find(d => d.uri === uri.toString());
            if (document) {
                const contents = document.getText();
                this.renderHTML(contents).then(html => {
                    this.node.innerHTML = html;
                });
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
        this.internalRevealForSourceLine(sourceLine);
    }
    protected readonly internalRevealForSourceLine: (sourceLine: number) => void = throttle(50, (sourceLine: number) => {
        if (!this.previewHandler || !this.previewHandler.findElementForSourceLine) {
            return;
        }
        const elementToReveal = this.previewHandler.findElementForSourceLine(sourceLine, this.node);
        if (elementToReveal) {
            this.preventScrollNotification = true;
            elementToReveal.scrollIntoView({ behavior: 'instant' });
            window.setTimeout(() => {
                this.preventScrollNotification = false;
            }, 50);
        }
    });

    get onDidScroll(): Event<number> {
        return this.onDidScrollEmitter.event;
    }

    protected fireDidScrollToSourceLine(line: number): void {
        this.onDidScrollEmitter.fire(line);
    }

    protected didScroll(scrollTop: number): void {
        if (!this.previewHandler || !this.previewHandler.getSourceLineForOffset) {
            return;
        }
        const offset = scrollTop;
        const line = this.previewHandler.getSourceLineForOffset(this.node, offset);
        if (line) {
            this.fireDidScrollToSourceLine(line);
        }
    }

    get onDidDoubleClick(): Event<Location> {
        return this.onDidDoubleClickEmitter.event;
    }

    protected fireDidDoubleClickToSourceLine(line: number): void {
        if (!this.resource) {
            return;
        }
        this.onDidDoubleClickEmitter.fire({
            uri: this.resource.uri.toString(),
            range: Range.create({ line, character: 0 }, { line, character: 0 })
        });
    }

    protected didDoubleClick(offsetTop: number): void {
        if (!this.previewHandler || !this.previewHandler.getSourceLineForOffset) {
            return;
        }
        const line = this.previewHandler.getSourceLineForOffset(this.node, offsetTop);
        if (line) {
            this.fireDidDoubleClickToSourceLine(line);
        }
    }

}
