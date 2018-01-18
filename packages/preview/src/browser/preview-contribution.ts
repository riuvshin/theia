/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, OpenHandler, ApplicationShell } from "@theia/core/lib/browser";
import { EDITOR_CONTEXT_MENU, EditorManager, TextEditor } from '@theia/editor/lib/browser';
import { CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry, CommandHandler, Disposable } from "@theia/core/lib/common";
import { DisposableCollection } from '@theia/core';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import URI from '@theia/core/lib/common/uri';
import { Position } from 'vscode-languageserver-types';
import { PreviewWidget, PREVIEW_WIDGET_FACTORY_ID } from './preview-widget';
import { PreviewHandlerProvider } from './preview-handler';

export namespace PreviewCommands {
    export const OPEN: Command = {
        id: 'preview:open',
        label: 'Open Preview'
    };
}

@injectable()
export class PreviewContribution implements CommandContribution, MenuContribution, OpenHandler, FrontendApplicationContribution {

    readonly id = 'preview';
    readonly label = 'Preview';

    protected readonly editorDisposables = new DisposableCollection();
    protected readonly previewDisposables = new DisposableCollection();

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(PreviewHandlerProvider)
    protected readonly previewHandlerProvider: PreviewHandlerProvider;

    onStart() {
        this.syncWithCurrentEditor();
    }

    protected async syncWithCurrentEditor(): Promise<void> {
        this.editorManager.onCurrentEditorChanged(async editorWidget => {
            if (!editorWidget) {
                return;
            }
            this.editorDisposables.dispose();
            const editor = editorWidget.editor;
            this.editorDisposables.push(editor.onCursorPositionChanged(position =>
                this.synchronizeSelectionToPreview(editor, position))
            );
            const previewWidget = this.getPreviewWidget();
            if (previewWidget) {
                this.editorDisposables.push(this.synchronizeSelectionToEditor(previewWidget, editor));
            }
        });
    }

    protected getPreviewWidget(): PreviewWidget | undefined {
        // note: this also ensures, we get resotored widgets
        const previewWidget = this.widgetManager.getWidgets(PREVIEW_WIDGET_FACTORY_ID).slice(-1)[0] as PreviewWidget;
        return previewWidget;
    }

    protected synchronizeSelectionToPreview(editor: TextEditor, position: Position): void {
        const uri = editor.uri.toString();
        const previewWidget = this.getPreviewWidget();
        if (!previewWidget || !previewWidget.uri || previewWidget.uri.toString() !== uri) {
            return;
        }
        previewWidget.revealForSourceLine(position.line);
    }

    protected synchronizeSelectionToEditor(previewWidget: PreviewWidget, editor: TextEditor): Disposable {
        const uri = editor.uri.toString();
        if (!previewWidget.uri || previewWidget.uri.toString() !== uri) {
            return Disposable.NULL;
        }
        return previewWidget.onDidScroll(sourceLine => {
            const line = Math.floor(sourceLine);
            editor.revealRange({
                start: {
                    line,
                    character: 0
                },
                end: {
                    line: line + 1,
                    character: 0
                }
            },
                {
                    at: 'top'
                });
        });
    }

    protected registerOpenOnDoubleClick(previewWidget: PreviewWidget): Disposable {
        return previewWidget.onDidDoubleClick(location => {
            this.editorManager.open(new URI(location.uri))
                .then(widget => {
                    if (widget) {
                        widget.editor.revealPosition(location.range.start);
                        return widget.editor;
                    }
                }).then(editor => {
                    if (editor) {
                        editor.selection = location.range;
                    }
                });
        });
    }

    canHandle(uri: URI): number {
        return (this.previewHandlerProvider.canHandle(uri)) ? 50 : 0;
    }

    async open(uri: URI, options: ApplicationShell.WidgetOptions = { area: 'main', mode: 'tab-after' }): Promise<PreviewWidget> {
        const previewWidget = await this.getOrCreateWidget(uri, options);
        this.app.shell.activateWidget(previewWidget.id);
        await previewWidget.start(uri);
        return previewWidget;
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(PreviewCommands.OPEN, <CommandHandler>{
            execute: () => this.openForEditor(),
            isEnabled: () => this.canHandleEditorUri(),
            isVisible: () => this.canHandleEditorUri(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        const menuPath = [...EDITOR_CONTEXT_MENU, 'navigation'];
        menus.registerMenuAction(menuPath, {
            commandId: PreviewCommands.OPEN.id,
            label: PreviewCommands.OPEN.label,
        });
    }

    protected canHandleEditorUri(): boolean {
        const uri = this.getCurrentEditorUri();
        if (uri) {
            return this.previewHandlerProvider.canHandle(uri);
        }
        return false;
    }

    protected getCurrentEditorUri(): URI | undefined {
        const activeEditor = this.editorManager.currentEditor;
        if (activeEditor) {
            return activeEditor.editor.uri;
        }
        return undefined;
    }

    protected async openForEditor(): Promise<void> {
        const editorWidget = this.editorManager.currentEditor;
        if (!editorWidget) {
            return;
        }
        const editor = editorWidget.editor;
        const uri = editor.uri;
        this.open(uri, { area: 'main', mode: 'split-right' }).then(previewWidget => {
            window.setTimeout(() => {
                this.synchronizeSelectionToPreview(editor, editor.cursor);
                this.synchronizeSelectionToEditor(previewWidget, editor);
            }, 100);
        });
    }

    protected async getOrCreateWidget(uri: URI, options: ApplicationShell.WidgetOptions): Promise<PreviewWidget> {
        let previewWidget = this.getPreviewWidget();
        if (!previewWidget) {
            previewWidget = <PreviewWidget>await this.widgetManager.getOrCreateWidget(PREVIEW_WIDGET_FACTORY_ID);
            this.app.shell.addWidget(previewWidget, options);
        }
        return previewWidget;
    }

    preparePreviewWidget(widget: PreviewWidget): void {
        this.previewDisposables.dispose();
        this.previewDisposables.push(this.registerOpenOnDoubleClick(widget));
    }

}
