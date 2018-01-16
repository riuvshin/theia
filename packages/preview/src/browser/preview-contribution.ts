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

    protected readonly disposables = new DisposableCollection();
    protected previewWidget: PreviewWidget | undefined;

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
            this.disposables.dispose();
            const editor = editorWidget.editor;
            this.disposables.push(editor.onCursorPositionChanged(position =>
                this.synchronizeSelectionToPreview(editor, position))
            );
            this.disposables.push(this.synchronizeSelectionToEditor(editor));
        });
    }

    protected getPreviewWidget(): PreviewWidget | undefined {
        if (!this.previewWidget) {
            // get restored widget, if exists
            this.previewWidget = this.widgetManager.getWidgets(PREVIEW_WIDGET_FACTORY_ID).slice(-1)[0] as PreviewWidget;
            if (this.previewWidget) {
                this.previewWidget.disposed.connect(() => {
                    this.previewWidget = undefined;
                });
            }
        }
        return this.previewWidget;
    }

    protected synchronizeSelectionToPreview(editor: TextEditor, position: Position): void {
        const uri = editor.uri.toString();
        const previewWidget = this.getPreviewWidget();
        if (!previewWidget || !previewWidget.uri || previewWidget.uri.toString() !== uri) {
            return;
        }
        previewWidget.revealForSourceLine(position.line);
    }

    protected synchronizeSelectionToEditor(editor: TextEditor): Disposable {
        const uri = editor.uri.toString();
        const previewWidget = this.getPreviewWidget();
        if (!previewWidget || !previewWidget.uri || previewWidget.uri.toString() !== uri) {
            return Disposable.NULL;
        }
        return previewWidget.addSelectionHandler(selectedLine => {
            editor.revealPosition({
                line: selectedLine,
                character: 0
            });
        });
    }

    canHandle(uri: URI): number {
        return (this.previewHandlerProvider.canHandle(uri)) ? 50 : 0;
    }

    async open(uri: URI, options: ApplicationShell.IMainAreaOptions = { mode: 'tab-after' }): Promise<PreviewWidget> {
        const previewWidget = await this.getOrCreateWidget(uri, options);
        this.app.shell.activateMain(previewWidget.id);
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

    protected async openForEditor(): Promise<void> {
        const uri = this.getCurrentEditorUri();
        if (uri) {
            this.open(uri, { mode: 'split-right' });
        }
    }

    protected getCurrentEditorUri(): URI | undefined {
        const activeEditor = this.editorManager.currentEditor;
        if (activeEditor) {
            return activeEditor.editor.uri;
        }
        return undefined;
    }

    protected async getOrCreateWidget(uri: URI, options: ApplicationShell.IMainAreaOptions): Promise<PreviewWidget> {
        let previewWidget = this.getPreviewWidget();
        if (!previewWidget) {
            previewWidget = this.previewWidget = <PreviewWidget>await this.widgetManager.getOrCreateWidget(PREVIEW_WIDGET_FACTORY_ID);
            previewWidget.disposed.connect(() => {
                this.previewWidget = undefined;
            });
            this.app.shell.addToMainArea(previewWidget, options);
        }
        return previewWidget;
    }

}
