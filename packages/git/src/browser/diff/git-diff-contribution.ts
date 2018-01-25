/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { CommandRegistry, Command, MenuModelRegistry, SelectionService, MessageType } from "@theia/core/lib/common";
import { FrontendApplication, AbstractViewContribution } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { injectable, inject } from "inversify";
import { GitDiffViewOptions } from './git-diff-model';
import { GitDiffWidget } from './git-diff-widget';
import { open, OpenerService } from "@theia/core/lib/browser";
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-menu';
import { UriCommandHandler, FileSystemCommandHandler } from '@theia/workspace/lib/browser/workspace-commands';
import { GitQuickOpenService } from '../git-quick-open-service';
import { FileSystem } from "@theia/filesystem/lib/common";
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import { NotificationsMessageClient } from "@theia/messages/lib/browser/notifications-message-client";

export namespace GitDiffCommands {
    export const OPEN_FILE_DIFF: Command = {
        id: 'git-diff:open-file-diff',
        label: 'Compare with ...'
    };
}

export const GIT_DIFF = "git-diff";

@injectable()
export class GitDiffContribution extends AbstractViewContribution<GitDiffWidget> {

    constructor(
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(OpenerService) protected openerService: OpenerService,
        @inject(NotificationsMessageClient) protected readonly notifications: NotificationsMessageClient
    ) {
        super({
            widgetId: GIT_DIFF,
            widgetName: 'Git diff',
            defaultWidgetOptions: {
                area: 'left',
                rank: 400
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...NAVIGATOR_CONTEXT_MENU, '5_diff'], {
            commandId: GitDiffCommands.OPEN_FILE_DIFF.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(GitDiffCommands.OPEN_FILE_DIFF, this.newFileHandler({
            execute: async uri => {
                await this.quickOpenService.chooseTagsAndBranches(
                    async (fromRevision, toRevision) => {
                        const fileUri = uri.toString();
                        const fileStat = await this.fileSystem.getFileStat(fileUri);
                        const options: GitDiffViewOptions = {
                            fileUri,
                            fromRevision,
                            toRevision
                        };
                        if (fileStat.isDirectory) {
                            this.showWidget(options);
                        } else {
                            const fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(fromRevision);
                            const toURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(toRevision);
                            const diffuri = DiffUris.encode(fromURI, toURI, uri.displayName);
                            if (diffuri) {
                                open(this.openerService, diffuri).catch(e => {
                                    const message = e.message.split('\n\n')[0];
                                    this.notifications.showMessage({
                                        text: message,
                                        type: MessageType.Error
                                    });
                                });
                            }
                        }
                    });
            }
        }));
    }

    async showWidget(options: GitDiffViewOptions) {
        const widget = await this.widget;
        await widget.initialize(options);
        this.openView({
            toggle: true,
            activate: true
        });
    }

    protected newFileHandler(handler: UriCommandHandler): FileSystemCommandHandler {
        return new FileSystemCommandHandler(this.selectionService, handler);
    }

}
