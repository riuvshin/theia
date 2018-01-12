/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, OpenHandler } from "@theia/core/lib/browser";
import { EDITOR_CONTEXT_MENU, EditorManager } from '@theia/editor/lib/browser';
import { CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry, CommandHandler } from "@theia/core/lib/common";
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import URI from '@theia/core/lib/common/uri';
import { ResourceProvider } from '@theia/core/lib/common';
import { MarkdownUri } from './markdown-uri';
import { MarkdownPreviewWidget } from './markdown-preview-widget';

export namespace MarkdownPreviewCommands {
    export const OPEN: Command = {
        id: 'markdownPreview:open',
        label: 'Open Preview'
    };
}

@injectable()
export class MarkdownPreviewContribution implements CommandContribution, MenuContribution, OpenHandler, FrontendApplicationContribution {

    readonly id = MarkdownPreviewCommands.OPEN.id;
    readonly label = MarkdownPreviewCommands.OPEN.label;

    protected widgetSequence = 0;
    protected readonly widgets = new Map<string, Promise<MarkdownPreviewWidget>>();

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    @inject(MarkdownUri)
    protected readonly markdownUri: MarkdownUri;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    async initializeLayout(app: FrontendApplication): Promise<void> {
    }

    canHandle(uri: URI): number {
        try {
            this.markdownUri.to(uri);
            return 50;
        } catch {
            return 0;
        }
    }

    async open(uri: URI): Promise<MarkdownPreviewWidget | undefined> {
        const widget = await this.getWidget(uri);
        this.app.shell.activateMain(widget.id);
        return widget;
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(MarkdownPreviewCommands.OPEN, <CommandHandler>{
            execute: async () => this.openForActiveEditor(),
            isEnabled: () => this.isMarkdownEditorOpened(),
            isVisible: () => this.isMarkdownEditorOpened(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        const menuPath = [...EDITOR_CONTEXT_MENU, 'navigation'];
        menus.registerMenuAction(menuPath, {
            commandId: MarkdownPreviewCommands.OPEN.id,
            label: MarkdownPreviewCommands.OPEN.label,
        });
    }

    protected isMarkdownEditorOpened(): boolean {
        const activeEditor = this.editorManager.currentEditor;
        if (!activeEditor) {
            return false;
        }
        return activeEditor.editor.uri.path.ext === '.md';
    }

    protected async openForActiveEditor(): Promise<void> {
        const activeEditor = this.editorManager.currentEditor;
        if (activeEditor) {
            await this.open(activeEditor.editor.uri);
        }
    }

    protected getWidget(uri: URI): Promise<MarkdownPreviewWidget> {
        const widget = this.widgets.get(uri.toString());
        if (widget) {
            return widget;
        }
        const promise = this.createWidget(uri);
        promise.then(w => w.disposed.connect(() =>
            this.widgets.delete(uri.toString())
        ));
        this.widgets.set(uri.toString(), promise);
        return promise;
    }

    protected async createWidget(uri: URI): Promise<MarkdownPreviewWidget> {
        const markdownUri = this.markdownUri.to(uri);
        const resource = await this.resourceProvider(markdownUri);
        const widget = new MarkdownPreviewWidget(resource);
        widget.id = `markdown-preview-` + this.widgetSequence++;
        widget.title.label = `Preview '${uri.path.base}'`;
        widget.title.caption = widget.title.label;
        widget.title.closable = true;
        this.app.shell.addToMainArea(widget);
        return widget;
    }

}
